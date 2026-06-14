import { useState, useMemo, useEffect, useCallback } from 'react'
import { getAuthToken, generate as generateApi } from '../../lib/apiClient'
import { useFlashcards } from '../../hooks/useFlashcards.js'
import * as dataProvider from '../../lib/dataProvider.js'
import { useAdaptiveFlashcardsPreview } from '../../hooks/useMastery'
import AdaptiveGenerateCTA from './AdaptiveGenerateCTA'
import FlashcardCommandHeader from './FlashcardCommandHeader'
import FlashcardEmptyState from './FlashcardEmptyState'
import { TagBadge, StatusPill } from './FlashcardBadges'
import { IconBrain, IconClock, IconFilter, IconGroup } from './FlashcardIcons'
import { ActiveFlashcardReview, FlashcardSessionComplete } from './FlashcardReviewViews'
import {
  STATUS_DISPLAY,
  TAG_COLORS,
  cardAnswer,
  conceptPrompt,
  getCardStatus,
  isFlashcardDue,
  sortFlashcards,
} from './flashcardDisplay'
import {
  getTopicGroup, getConceptFromTopic, getQuestionAngle, getTopicGroupOptions, matchesTopicGroup,
} from '../../lib/flashcardTopicHelpers.js'
import {
  getFlashcardGroups, createFlashcardGroup, renameFlashcardGroup, deleteFlashcardGroup,
  addCardsToGroup, removeCardsFromGroup, clearAllFlashcardGroups,
} from '../../lib/flashcardGroups.js'
import { normalizeSubjectLabel, normalizeSystemLabel } from '../../lib/usmleTaxonomy.js'

export default function FlashcardsPage({ onNavigate }) {
  // Core state
  const { cards, refresh } = useFlashcards()
  const [reviewMode, setReviewMode]   = useState(false)
  const [reviewCards, setReviewCards] = useState([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [flipped, setFlipped]         = useState(false)
  const [sessionDone, setSessionDone] = useState(false)
  const [reviewSummary, setReviewSummary] = useState({ again: 0, hard: 0, good: 0, easy: 0 })

  // Filter / sort state
  const [expandedId, setExpandedId]             = useState(null)
  const [filterStatus, setFilterStatus]         = useState('all')
  const [filterTag, setFilterTag]               = useState('all')
  const [filterSubject, setFilterSubject]       = useState('all')
  const [filterSystem, setFilterSystem]         = useState('all')
  const [filterTopicGroup, setFilterTopicGroup] = useState('all')
  const [searchQuery, setSearchQuery]           = useState('')
  const [sortMode, setSortMode]                 = useState('due')
  const [filterOpen, setFilterOpen]             = useState(false)
  const [copyMsg, setCopyMsg]                   = useState(null)

  // Custom groups state
  const [groups, setGroups]                   = useState(() => getFlashcardGroups())
  const [activeGroupId, setActiveGroupId]     = useState('all')
  const [selectMode, setSelectMode]           = useState(false)
  const [selectedCardIds, setSelectedCardIds] = useState(new Set())
  const [groupModalOpen, setGroupModalOpen]   = useState(false)
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)
  const [newGroupName, setNewGroupName]       = useState('')
  const [newGroupDesc, setNewGroupDesc]       = useState('')
  const [renameGroupId, setRenameGroupId]     = useState(null)
  const [renameGroupName, setRenameGroupName] = useState('')
  const [addConfirmMsg, setAddConfirmMsg]     = useState(null)

  // Adaptive AI flashcard generation
  const [aiGenState, setAiGenState] = useState('idle') // 'idle' | 'loading' | 'done' | 'error'
  const [aiGenMsg,   setAiGenMsg]   = useState(null)
  const adaptivePlan = useAdaptiveFlashcardsPreview()

  const handleGenerateAI = async () => {
    if (aiGenState === 'loading') return
    setAiGenState('loading'); setAiGenMsg(null)
    try {
      const count = adaptivePlan.data?.recommendedCardCount || 10
      const data  = await generateApi.flashcards(Math.min(count, 20))
      if (data?.flashcards?.length) {
        const { added } = await dataProvider.saveFlashcards(data.flashcards)
        refresh()
        setAiGenState('done')
        setAiGenMsg(`${added} reinforcement card${added !== 1 ? 's' : ''} added`)
      } else {
        setAiGenState('error'); setAiGenMsg('No cards returned - try again')
      }
    } catch (err) {
      setAiGenState('error')
      setAiGenMsg(err.message?.includes('API key') ? 'AI unavailable' : 'Generation failed')
    }
  }

  const showAdaptiveCTA = getAuthToken() && import.meta.env.VITE_USE_BACKEND === 'true'

  // Derived counts
  const newCount      = cards.filter(c => getCardStatus(c) === 'new').length
  const learningCount = cards.filter(c => getCardStatus(c) === 'learning').length
  const masteredCount = cards.filter(c => getCardStatus(c) === 'mastered').length
  const dueCount      = cards.filter(isFlashcardDue).length

  // Computed filter options
  const allTags     = useMemo(() => { const s = new Set(); cards.forEach(c => c.tag && s.add(c.tag)); return [...s] }, [cards])
  const allSubjects = useMemo(() => [...new Set(cards.map(c => c.subject).filter(Boolean))].sort(), [cards])
  const allSystems  = useMemo(() => [...new Set(cards.map(c => c.system).filter(Boolean))].sort(),  [cards])
  const topicGroupOptions = useMemo(() => {
    const opts = getTopicGroupOptions(cards)
    return opts.sort((a, b) => b.count - a.count || a.topicGroup.localeCompare(b.topicGroup))
  }, [cards])

  // Card groups map
  const cardGroupsMap = useMemo(() => {
    const map = {}
    groups.forEach(g => g.cardIds.forEach(id => {
      if (!map[id]) map[id] = []
      map[id].push(g)
    }))
    return map
  }, [groups])

  // Topic intelligence
  const weakTopics = useMemo(() => {
    const counts = {}
    cards.filter(c => getCardStatus(c) === 'new' || getCardStatus(c) === 'learning').forEach(c => {
      const tg = getTopicGroup(c)
      if (tg) counts[tg] = (counts[tg] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([topicGroup, count]) => ({ topicGroup, count }))
  }, [cards])

  const recentTopics = useMemo(() => {
    const totalCounts = {}
    cards.forEach(c => { const tg = getTopicGroup(c); if (tg) totalCounts[tg] = (totalCounts[tg] || 0) + 1 })
    const sorted = [...cards].filter(c => getTopicGroup(c)).sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return bt - at
    })
    const seen = new Set()
    const result = []
    for (const c of sorted) {
      const tg = getTopicGroup(c)
      if (tg && !seen.has(tg)) { seen.add(tg); result.push({ topicGroup: tg, count: totalCounts[tg] || 0 }) }
      if (result.length >= 5) break
    }
    return result
  }, [cards])

  // Active filter chips
  const activeFilterChips = useMemo(() => {
    const chips = []
    if (filterStatus !== 'all') chips.push({ key: 'status', label: STATUS_DISPLAY[filterStatus] ?? filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1), onRemove: () => setFilterStatus('all') })
    if (filterTag !== 'all')     chips.push({ key: 'tag',    label: filterTag,    onRemove: () => setFilterTag('all') })
    if (filterSubject !== 'all') chips.push({ key: 'subj',   label: filterSubject, onRemove: () => setFilterSubject('all') })
    if (filterSystem !== 'all')  chips.push({ key: 'sys',    label: filterSystem,  onRemove: () => setFilterSystem('all') })
    if (filterTopicGroup !== 'all') chips.push({ key: 'tg', label: filterTopicGroup, onRemove: () => setFilterTopicGroup('all') })
    if (activeGroupId !== 'all') {
      const g = groups.find(g => g.id === activeGroupId)
      if (g) chips.push({ key: 'group', label: g.name, onRemove: () => setActiveGroupId('all') })
    }
    return chips
  }, [filterStatus, filterTag, filterSubject, filterSystem, filterTopicGroup, activeGroupId, groups])

  const activeFilterCount = activeFilterChips.length

  // Processed cards pipeline
  const processedCards = useMemo(() => {
    let r = cards
    if (filterStatus     !== 'all') r = r.filter(c => getCardStatus(c) === filterStatus)
    if (filterTag        !== 'all') r = r.filter(c => c.tag     === filterTag)
    if (filterSubject    !== 'all') r = r.filter(c => normalizeSubjectLabel(c.subject) === normalizeSubjectLabel(filterSubject))
    if (filterSystem     !== 'all') r = r.filter(c => normalizeSystemLabel(c.system) === normalizeSystemLabel(filterSystem))
    if (filterTopicGroup !== 'all') r = r.filter(c => matchesTopicGroup(c, filterTopicGroup))
    if (activeGroupId !== 'all') {
      const group = groups.find(g => g.id === activeGroupId)
      if (group) { const idSet = new Set(group.cardIds); r = r.filter(c => idSet.has(c.id)) }
      else r = []
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      r = r.filter(c =>
        (c.front            || '').toLowerCase().includes(q) ||
        (c.back             || '').toLowerCase().includes(q) ||
        (c.topic            || '').toLowerCase().includes(q) ||
        getTopicGroup(c).toLowerCase().includes(q) ||
        getConceptFromTopic(c).toLowerCase().includes(q) ||
        getQuestionAngle(c).toLowerCase().includes(q) ||
        (c.concept          || '').toLowerCase().includes(q) ||
        (c.rawTopic         || '').toLowerCase().includes(q) ||
        (c.canonicalTopic   || '').toLowerCase().includes(q) ||
        (c.topicSlug        || '').toLowerCase().includes(q) ||
        (c.testedConcept    || '').toLowerCase().includes(q) ||
        (c.subject          || '').toLowerCase().includes(q) ||
        (c.system           || '').toLowerCase().includes(q) ||
        (c.tag              || '').toLowerCase().includes(q) ||
        (c.sourceMode       || '').toLowerCase().includes(q) ||
        (c.weakSpotCategory || '').toLowerCase().includes(q) ||
        (cardGroupsMap[c.id] || []).some(g => g.name.toLowerCase().includes(q))
      )
    }
    return sortFlashcards(r, sortMode)
  }, [cards, filterStatus, filterTag, filterSubject, filterSystem, filterTopicGroup, activeGroupId, groups, cardGroupsMap, searchQuery, sortMode])

  const hasActiveFilters = activeFilterCount > 0 || !!searchQuery.trim() || sortMode !== 'due'

  const clearFilters = () => {
    setFilterStatus('all'); setFilterTag('all'); setFilterSubject('all')
    setFilterSystem('all'); setFilterTopicGroup('all'); setActiveGroupId('all')
    setSearchQuery(''); setSortMode('due')
  }

  const refreshGroups = () => setGroups(getFlashcardGroups())

  // Review handlers
  const doStartReview = (subset, preserveOrder = true) => {
    const source = subset ?? processedCards
    if (source.length === 0) return
    const ordered = preserveOrder ? [...source] : sortFlashcards(source, 'due')
    setReviewCards(ordered); setReviewIndex(0); setFlipped(false)
    setSessionDone(false); setReviewSummary({ again: 0, hard: 0, good: 0, easy: 0 })
    setReviewMode(true)
  }

  const handleEase = useCallback((ease) => {
    setReviewSummary(prev => ({ ...prev, [ease]: prev[ease] + 1 }))
    dataProvider.reviewFlashcard(reviewCards[reviewIndex].id, ease)
    if (reviewIndex < reviewCards.length - 1) { setReviewIndex(i => i + 1); setFlipped(false) }
    else { setSessionDone(true); refresh() }
  }, [reviewCards, reviewIndex, refresh])

  const exitReview = () => {
    setReviewMode(false); setSessionDone(false); setReviewIndex(0); setFlipped(false); refresh()
  }

  const goToPrev = () => { if (reviewIndex > 0) { setReviewIndex(i => i - 1); setFlipped(false) } }
  const goToNext = () => { if (reviewIndex < reviewCards.length - 1) { setReviewIndex(i => i + 1); setFlipped(false) } }

  // Keyboard shortcuts (review mode only)
  useEffect(() => {
    if (!reviewMode || sessionDone) return
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === ' ') { e.preventDefault(); if (!flipped) setFlipped(true) }
      else if (e.key === 'Escape') { setReviewMode(false); setSessionDone(false); setReviewIndex(0); setFlipped(false); refresh() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (reviewIndex > 0) { setReviewIndex(i => i - 1); setFlipped(false) } }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (reviewIndex < reviewCards.length - 1) { setReviewIndex(i => i + 1); setFlipped(false) } }
      else if (flipped) {
        const EASE_KEYS = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' }
        const ease = EASE_KEYS[e.key]
        if (ease) handleEase(ease)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reviewMode, sessionDone, flipped, reviewIndex, reviewCards, handleEase, refresh])

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id)

  // Copy / export
  const handleCopyAll = () => {
    if (processedCards.length === 0) return
    const text = processedCards.map(c => {
      const cg = cardGroupsMap[c.id]
      return [
        `Front: ${c.front || ''}`,
        `Back: ${c.back || ''}`,
        c.tag                         ? `Tag: ${c.tag}`                                 : null,
        c.subject                     ? `Subject: ${c.subject}`                         : null,
        c.system                      ? `System: ${c.system}`                           : null,
        getTopicGroup(c)              ? `Topic Group: ${getTopicGroup(c)}`              : null,
        getConceptFromTopic(c)        ? `Concept: ${getConceptFromTopic(c)}`            : null,
        getQuestionAngle(c)           ? `Question Angle: ${getQuestionAngle(c)}`        : null,
        c.canonicalTopic              ? `CanonicalTopic: ${c.canonicalTopic}`           : null,
        c.topicSlug                   ? `TopicSlug: ${c.topicSlug}`                     : null,
        c.sourceMode                  ? `SourceMode: ${c.sourceMode}`                   : null,
        c.weakSpotCategory            ? `WeakSpotCategory: ${c.weakSpotCategory}`       : null,
        `Status: ${getCardStatus(c)}`,
        cg?.length                    ? `Groups: ${cg.map(g => g.name).join(', ')}`     : null,
      ].filter(Boolean).join('\n')
    }).join('\n\n')
    navigator.clipboard.writeText(text).then(
      () => { setCopyMsg('copied'); setTimeout(() => setCopyMsg(null), 2000) },
      () => { setCopyMsg('failed'); setTimeout(() => setCopyMsg(null), 2500) }
    )
  }

  const handleExportCSV = () => {
    if (processedCards.length === 0) return
    const esc = v => `"${(v || '').replace(/"/g, '""')}"`
    const rows = [['Front', 'Back', 'Tag', 'Subject', 'System', 'TopicGroup', 'Concept', 'QuestionAngle', 'Topic', 'RawTopic', 'CanonicalTopic', 'TopicSlug', 'SourceMode', 'WeakSpotCategory', 'Status', 'ManualGroups']]
    processedCards.forEach(c => {
      const cg = cardGroupsMap[c.id]
      rows.push([
        esc(c.front), esc(c.back), esc(c.tag), esc(c.subject),
        esc(c.system), esc(getTopicGroup(c)), esc(getConceptFromTopic(c)), esc(getQuestionAngle(c)),
        esc(c.topic), esc(c.rawTopic), esc(c.canonicalTopic), esc(c.topicSlug),
        esc(c.sourceMode), esc(c.weakSpotCategory), esc(getCardStatus(c)),
        esc(cg?.map(g => g.name).join('; ') || ''),
      ])
    })
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'medica_clinical_reinforcement.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleClearDeck = async () => {
    if (!window.confirm('Clear all reinforcement items and custom groups? This cannot be undone.')) return
    await dataProvider.clearFlashcards()
    clearAllFlashcardGroups()
    refresh()
    setGroups([]); setActiveGroupId('all')
    setSelectMode(false); setSelectedCardIds(new Set())
  }

  // Group handlers
  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return
    const group = createFlashcardGroup(newGroupName, newGroupDesc)
    if (selectedCardIds.size > 0) {
      addCardsToGroup(group.id, [...selectedCardIds])
      const count = selectedCardIds.size
      setAddConfirmMsg(`${count} item${count !== 1 ? 's' : ''} added to "${newGroupName.trim()}"`)
      setTimeout(() => setAddConfirmMsg(null), 2500)
      setSelectMode(false); setSelectedCardIds(new Set())
    }
    setNewGroupName(''); setNewGroupDesc(''); setGroupModalOpen(false); refreshGroups()
  }

  const handleRenameGroup = () => {
    if (!renameGroupName.trim() || !renameGroupId) return
    renameFlashcardGroup(renameGroupId, renameGroupName)
    setRenameGroupId(null); setRenameGroupName(''); refreshGroups()
  }

  const handleDeleteGroup = (groupId) => {
    if (!window.confirm('Delete this group? Cards will not be deleted.')) return
    deleteFlashcardGroup(groupId)
    if (activeGroupId === groupId) setActiveGroupId('all')
    refreshGroups()
  }

  const handleAddToGroup = (groupId) => {
    if (selectedCardIds.size === 0) return
    addCardsToGroup(groupId, [...selectedCardIds])
    const group = groups.find(g => g.id === groupId)
    const count = selectedCardIds.size
    setAddConfirmMsg(`${count} item${count !== 1 ? 's' : ''} added to "${group?.name || 'group'}"`)
    setTimeout(() => setAddConfirmMsg(null), 2500)
    setGroupPickerOpen(false); setSelectMode(false); setSelectedCardIds(new Set()); refreshGroups()
  }

  const handleRemoveFromGroup = () => {
    if (selectedCardIds.size === 0 || activeGroupId === 'all') return
    removeCardsFromGroup(activeGroupId, [...selectedCardIds])
    setSelectedCardIds(new Set()); refreshGroups()
  }

  const toggleCardSelect = (cardId) => setSelectedCardIds(prev => {
    const next = new Set(prev)
    if (next.has(cardId)) next.delete(cardId); else next.add(cardId)
    return next
  })

  const exitSelectMode = () => { setSelectMode(false); setSelectedCardIds(new Set()) }

  if (reviewMode && sessionDone) {
    return (
      <FlashcardSessionComplete
        reviewCards={reviewCards}
        reviewSummary={reviewSummary}
        onReinforceAgain={() => doStartReview(reviewCards, true)}
        onBackToLibrary={exitReview}
      />
    )
  }

  if (reviewMode && reviewCards.length > 0) {
    return (
      <ActiveFlashcardReview
        card={reviewCards[reviewIndex]}
        flipped={flipped}
        reviewIndex={reviewIndex}
        reviewCount={reviewCards.length}
        onExit={exitReview}
        onReveal={() => setFlipped(true)}
        onEase={handleEase}
        onPrev={goToPrev}
        onNext={goToNext}
      />
    )
  }

  if (cards.length === 0) {
    return (
      <FlashcardEmptyState
        showAdaptiveCTA={showAdaptiveCTA}
        adaptivePlan={adaptivePlan}
        aiGenState={aiGenState}
        aiGenMsg={aiGenMsg}
        onGenerateAI={handleGenerateAI}
        onNavigate={onNavigate}
      />
    )
  }

  // DECK VIEW
  return (
    <div className="fc-page">
      {addConfirmMsg && (
        <div className="fc-add-confirm" role="status" aria-live="polite">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M2.5 6.5L5.5 9.5L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {addConfirmMsg}
        </div>
      )}

      <div className="fc-scroll">
        <div className="fc-content">

          {/* 1. Command Header */}
          <FlashcardCommandHeader
            totalCount={cards.length}
            dueCount={dueCount}
            visibleCount={processedCards.length}
            copyMsg={copyMsg}
            onCopyAll={handleCopyAll}
            onExportCSV={handleExportCSV}
            onStartReview={() => doStartReview(processedCards, true)}
            onClearDeck={handleClearDeck}
          />

          {/* Adaptive AI generation strip */}
          {showAdaptiveCTA && (
            <AdaptiveGenerateCTA
              plan={adaptivePlan}
              state={aiGenState}
              msg={aiGenMsg}
              onGenerate={handleGenerateAI}
              compact
            />
          )}

          {/* 2. Today's Review card */}
          <div className={`fc-review-queue${dueCount === 0 ? ' fc-review-queue--done' : ''}`}>
            <div className="fc-review-queue-main">
              <div className="fc-review-queue-text">
                <div className="fc-review-queue-eyebrow">
                  <IconClock/>
                  Today's Reinforcement
                </div>
                <div className="fc-review-queue-count">
                  {dueCount > 0 ? `${dueCount} item${dueCount !== 1 ? 's' : ''} due` : 'All caught up!'}
                </div>
                <p className="fc-review-queue-sub">
                  {dueCount > 0
                    ? 'Review due items first to protect retention.'
                    : 'All items are up-to-date. Great work!'}
                </p>
                {dueCount > 0 && (
                  <button type="button" className="fc-review-now-btn"
                    onClick={() => doStartReview(sortFlashcards(cards.filter(isFlashcardDue), 'due'), true)}
                    aria-label={`Reinforce ${dueCount} due items`}
                  >
                    Reinforce Now
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
              </div>
              <div className="fc-review-queue-stats">
                {[
                  { num: newCount,      lbl: 'New',      color: '#2E64C8'                },
                  { num: learningCount, lbl: 'Unstable',  color: 'var(--status-warn)'    },
                  { num: masteredCount, lbl: 'Mastered',  color: 'var(--status-stable)'  },
                  { num: cards.length,  lbl: 'Total',     color: 'rgba(244,246,250,.85)' },
                ].map(({ num, lbl, color }) => (
                  <div key={lbl} className="fc-review-queue-stat">
                    <span className="fc-rqs-num" style={{ color }}>{num}</span>
                    <span className="fc-rqs-lbl">{lbl}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Topic Intelligence */}
          {(weakTopics.length > 0 || recentTopics.length > 0) && (
            <div className="fc-topic-intel">
              <div className="fc-topic-intel-header">
                <span className="fc-topic-intel-title">
                  <IconBrain/>
                  Topic Intelligence
                </span>
              </div>
              <div className="fc-topic-intel-body">
                {weakTopics.length > 0 && (
                  <div className="fc-topic-section">
                    <div className="fc-topic-section-hdr">
                      <span className="fc-topic-section-title">Weak Topics</span>
                      <span className="fc-topic-section-sub">Focus on what you're struggling with</span>
                    </div>
                    <div className="fc-topic-row">
                      {weakTopics.map(({ topicGroup, count }) => (
                        <button key={topicGroup} type="button"
                          className={`fc-topic-chip${filterTopicGroup === topicGroup ? ' active' : ''}`}
                          onClick={() => setFilterTopicGroup(filterTopicGroup === topicGroup ? 'all' : topicGroup)}
                          aria-pressed={filterTopicGroup === topicGroup}
                        >
                          {topicGroup}
                          <span className="fc-topic-chip-count">{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {recentTopics.length > 0 && (
                  <div className="fc-topic-section">
                    <div className="fc-topic-section-hdr">
                      <span className="fc-topic-section-title">Recent Topics</span>
                      <span className="fc-topic-section-sub">Recently added or reviewed</span>
                    </div>
                    <div className="fc-topic-row">
                      {recentTopics.map(({ topicGroup, count }) => (
                        <button key={topicGroup} type="button"
                          className={`fc-topic-chip recent${filterTopicGroup === topicGroup ? ' active' : ''}`}
                          onClick={() => setFilterTopicGroup(filterTopicGroup === topicGroup ? 'all' : topicGroup)}
                          aria-pressed={filterTopicGroup === topicGroup}
                        >
                          {topicGroup}
                          <span className="fc-topic-chip-count">{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. Custom Groups */}
          <div className="fc-custom-groups">
            <div className="fc-custom-groups-header">
              <span className="fc-custom-groups-title">
                <IconGroup/>
                Custom Groups
              </span>
              <div className="fc-custom-groups-actions">
                <button type="button" className="fc-select-mode-btn"
                  onClick={() => { if (selectMode) exitSelectMode(); else setSelectMode(true) }}
                >
                  {selectMode ? 'Cancel' : 'Select Cards'}
                </button>
                <button type="button" className="fc-new-group-btn" onClick={() => setGroupModalOpen(true)}>
                  + New Group
                </button>
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="fc-custom-groups-empty">Create a group to organise cards for focused study.</p>
            ) : (
              <div className="fc-custom-group-row">
                <button type="button"
                  className={`fc-custom-group-chip${activeGroupId === 'all' ? ' active' : ''}`}
                  onClick={() => setActiveGroupId('all')}
                  aria-pressed={activeGroupId === 'all'}
                >
                  All Cards
                  <span className="fc-custom-group-count">{cards.length}</span>
                </button>
                {groups.map(g => (
                  <div key={g.id} className="fc-custom-group-chip-wrap">
                    <button type="button"
                      className={`fc-custom-group-chip${activeGroupId === g.id ? ' active' : ''}`}
                      onClick={() => setActiveGroupId(activeGroupId === g.id ? 'all' : g.id)}
                      aria-pressed={activeGroupId === g.id}
                    >
                      {g.name}
                      <span className="fc-custom-group-count">{g.cardIds.length}</span>
                    </button>
                    <div className="fc-group-mgmt-btns">
                      <button type="button" className="fc-group-mgmt-btn"
                        title={`Rename "${g.name}"`} aria-label={`Rename ${g.name}`}
                        onClick={() => { setRenameGroupId(g.id); setRenameGroupName(g.name) }}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M6.5 1.5L8.5 3.5L2.5 9.5H0.5V7.5L6.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button type="button" className="fc-group-mgmt-btn danger"
                        title={`Delete "${g.name}"`} aria-label={`Delete ${g.name}`}
                        onClick={() => handleDeleteGroup(g.id)}
                      >x</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeGroupId !== 'all' && groups.some(g => g.id === activeGroupId) && (
              <button type="button" className="fc-action-btn primary sm"
                style={{ alignSelf: 'flex-start', marginTop: 8 }}
                onClick={() => {
                  const group = groups.find(g => g.id === activeGroupId)
                  if (!group) return
                  const idSet = new Set(group.cardIds)
                  const groupCards = sortFlashcards(cards.filter(c => idSet.has(c.id)), 'due')
                  if (groupCards.length > 0) doStartReview(groupCards, true)
                }}
                disabled={!groups.find(g => g.id === activeGroupId)?.cardIds.length}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6.5L5 9.5L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Reinforce Group
              </button>
            )}
          </div>

          {/* Bulk action bar */}
          {selectMode && (
            <div className="fc-bulk-bar">
              <span className="fc-bulk-count">{selectedCardIds.size} selected</span>
              <div className="fc-bulk-actions">
                {selectedCardIds.size > 0 && groups.length > 0 && (
                  <button type="button" className="fc-action-btn sm" onClick={() => setGroupPickerOpen(true)}>Add to Group</button>
                )}
                {selectedCardIds.size > 0 && (
                  <button type="button" className="fc-action-btn sm" onClick={() => setGroupModalOpen(true)}>New Group</button>
                )}
                {selectedCardIds.size > 0 && activeGroupId !== 'all' && (
                  <button type="button" className="fc-action-btn sm fc-bulk-remove-btn" onClick={handleRemoveFromGroup}>Remove from Group</button>
                )}
                <button type="button" className="fc-action-btn sm" onClick={exitSelectMode}>Clear Selection</button>
              </div>
            </div>
          )}

          {/* 5. Toolbar */}
          <div className="fc-toolbar-card">
            <div className="fc-toolbar-row">
              <div className="fc-search-wrap">
                <svg className="fc-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <input type="text" className="fc-search-input"
                  placeholder="Search items - clinical prompt, mechanism, topic, concept..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  aria-label="Search flashcards"
                />
              </div>
              <select className="fc-sort-select" value={sortMode} onChange={e => setSortMode(e.target.value)} aria-label="Sort cards">
                <option value="due">Due for Review</option>
                <option value="newest">Newest First</option>
                <option value="weakest">Weakest First</option>
                <option value="topic">Topic</option>
                <option value="subject">Subject</option>
                <option value="status">Status</option>
              </select>
              <button type="button"
                className={`fc-filter-toggle${filterOpen ? ' open' : ''}`}
                onClick={() => setFilterOpen(o => !o)}
                aria-expanded={filterOpen}
                aria-label="Toggle filter panel"
              >
                <IconFilter/>
                Filters
                {activeFilterCount > 0 && <span className="fc-filter-badge">{activeFilterCount}</span>}
              </button>
            </div>

            {/* Active filter chips */}
            {activeFilterChips.length > 0 && (
              <div className="fc-active-filter-chips">
                {activeFilterChips.map(chip => (
                  <button key={chip.key} type="button" className="fc-filter-chip" onClick={chip.onRemove} aria-label={`Remove ${chip.label} filter`}>
                    {chip.label}
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
                      <path d="M1.5 1.5L7.5 7.5M7.5 1.5L1.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                ))}
                <button type="button" className="fc-clear-all-btn" onClick={clearFilters}>Clear all</button>
              </div>
            )}

            {/* Collapsible filter panel */}
            {filterOpen && (
              <div className="fc-advanced-filters">
                <div className="fc-filter-pills">
                  {['all', 'new', 'learning', 'mastered'].map(s => (
                    <button key={s} type="button"
                      className={`fc-filter-pill${filterStatus === s ? ' active' : ''}`}
                      onClick={() => setFilterStatus(s)} aria-pressed={filterStatus === s}
                    >
                      {s === 'all' ? 'All Status' : STATUS_DISPLAY[s] ?? s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                {allTags.length > 0 && (
                  <div className="fc-filter-pills">
                    {allTags.map(tag => (
                      <button key={tag} type="button"
                        className={`fc-filter-pill${filterTag === tag ? ' active tag-active' : ''}`}
                        style={filterTag === tag ? (TAG_COLORS[tag] ?? {}) : {}}
                        onClick={() => setFilterTag(filterTag === tag ? 'all' : tag)}
                        aria-pressed={filterTag === tag}
                      >{tag}</button>
                    ))}
                  </div>
                )}
                {(allSubjects.length > 0 || allSystems.length > 0 || topicGroupOptions.length > 0) && (
                  <div className="fc-filter-dropdowns">
                    {allSubjects.length > 0 && (
                      <select className="fc-sort-select" value={filterSubject}
                        onChange={e => setFilterSubject(e.target.value)} aria-label="Filter by subject">
                        <option value="all">All Subjects</option>
                        {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {allSystems.length > 0 && (
                      <select className="fc-sort-select" value={filterSystem}
                        onChange={e => setFilterSystem(e.target.value)} aria-label="Filter by system">
                        <option value="all">All Systems</option>
                        {allSystems.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {topicGroupOptions.length > 0 && (
                      <select className="fc-sort-select" value={filterTopicGroup}
                        onChange={e => setFilterTopicGroup(e.target.value)} aria-label="Filter by topic group">
                        <option value="all">All Topics</option>
                        {topicGroupOptions.map(({ topicGroup, count }) => (
                          <option key={topicGroup} value={topicGroup}>{topicGroup} / {count}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 6. Card Library */}
          <div className="fc-library">
            <div className="fc-library-header">
              <div className="fc-library-header-left">
                <span className="fc-library-title">Reinforcement Library</span>
                <span className="fc-library-count">{processedCards.length} item{processedCards.length !== 1 ? 's' : ''}</span>
              </div>
              {hasActiveFilters && (
                <button type="button" className="fc-clear-filters" onClick={clearFilters}>Clear filters</button>
              )}
            </div>

            {processedCards.length === 0 ? (
              <div className="fc-no-results">No cards match your filters.</div>
            ) : processedCards.map(card => {
              const isExpanded = expandedId === card.id
              const isSelected = selectMode && selectedCardIds.has(card.id)
              const accent = TAG_COLORS[card.tag]?.color ?? 'var(--blue)'
              const topicGroupLabel  = getTopicGroup(card)
              const conceptLabel     = getConceptFromTopic(card)
              const angleLabel       = getQuestionAngle(card)
              const cardGroups       = cardGroupsMap[card.id]
              const metaParts = [
                card.subject,
                card.system,
                topicGroupLabel,
                card.sourceMode === 'coach' ? 'Coach' : card.sourceMode === 'practice' ? 'Practice' : null,
              ].filter(Boolean)
              const metaLine2Parts = [conceptLabel, angleLabel].filter(Boolean)

              return (
                <div key={card.id}
                  className={`fc-card-item${isExpanded ? ' expanded' : ''}${selectMode ? ' in-select-mode' : ''}${isSelected ? ' selected' : ''}`}
                  style={{ '--accent': accent }}
                >
                  {selectMode && (
                    <button type="button"
                      className={`fc-card-select${isSelected ? ' checked' : ''}`}
                      onClick={() => toggleCardSelect(card.id)}
                      aria-label={isSelected ? 'Deselect item' : 'Select item'}
                      aria-pressed={isSelected}
                    >
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  )}
                  <button type="button" className="fc-card-item-btn"
                    onClick={() => toggleExpand(card.id)}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? 'Collapse card' : 'Expand card'}
                  >
                    <div className="fc-card-item-left">
                      <div className="fc-card-accent-bar"/>
                      <div className="fc-card-item-body">
                        <p className="fc-card-front">{conceptPrompt(card)}</p>
                        {!isExpanded && <p className="fc-card-back-preview">{cardAnswer(card)}</p>}
                        {metaParts.length > 0 && (
                          <p className="fc-meta-line">{metaParts.join(' / ')}</p>
                        )}
                        {metaLine2Parts.length > 0 && (
                          <p className="fc-meta-line" style={{ opacity: .7 }}>{metaLine2Parts.join(' / ')}</p>
                        )}
                        {cardGroups?.length > 0 && (
                          <div className="fc-group-badges">
                            {cardGroups.slice(0, 2).map(g => (
                              <span key={g.id} className="fc-group-badge">{g.name}</span>
                            ))}
                            {cardGroups.length > 2 && (
                              <span className="fc-group-badge-more">+{cardGroups.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="fc-card-item-right">
                      <TagBadge tag={card.tag}/>
                      <StatusPill status={card.reviewStatus}/>
                      <svg className={`fc-chevron${isExpanded ? ' open' : ''}`}
                        width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="fc-card-item-answer">
                      <div className="fc-card-item-divider"/>
                      <p className="fc-card-back-full">{cardAnswer(card)}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

        </div>
      </div>

      {/* Modals */}
      {groupModalOpen && (
        <div className="fc-modal-overlay" onClick={() => { setGroupModalOpen(false); setNewGroupName(''); setNewGroupDesc('') }}>
          <div className="fc-group-modal" onClick={e => e.stopPropagation()}>
            <h3 className="fc-group-modal-title">Create Group</h3>
            <input type="text" className="fc-group-input"
              placeholder="Group name (e.g. Exam Tomorrow)"
              value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
              autoFocus maxLength={60} aria-label="Group name"
            />
            <input type="text" className="fc-group-input"
              placeholder="Description (optional)"
              value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
              maxLength={120} aria-label="Group description"
            />
            {selectedCardIds.size > 0 && (
              <p style={{ fontSize: 12, color: 'var(--t3)', margin: '0 0 2px' }}>
                {selectedCardIds.size} selected item{selectedCardIds.size !== 1 ? 's' : ''} will be added to this group.
              </p>
            )}
            <div className="fc-group-modal-actions">
              <button type="button" className="fc-action-btn"
                onClick={() => { setGroupModalOpen(false); setNewGroupName(''); setNewGroupDesc('') }}
              >Cancel</button>
              <button type="button" className="fc-action-btn primary"
                onClick={handleCreateGroup} disabled={!newGroupName.trim()}
              >Create</button>
            </div>
          </div>
        </div>
      )}

      {renameGroupId && (
        <div className="fc-modal-overlay" onClick={() => { setRenameGroupId(null); setRenameGroupName('') }}>
          <div className="fc-group-modal" onClick={e => e.stopPropagation()}>
            <h3 className="fc-group-modal-title">Rename Group</h3>
            <input type="text" className="fc-group-input"
              value={renameGroupName} onChange={e => setRenameGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRenameGroup()}
              autoFocus maxLength={60} aria-label="New group name"
            />
            <div className="fc-group-modal-actions">
              <button type="button" className="fc-action-btn"
                onClick={() => { setRenameGroupId(null); setRenameGroupName('') }}
              >Cancel</button>
              <button type="button" className="fc-action-btn primary"
                onClick={handleRenameGroup} disabled={!renameGroupName.trim()}
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {groupPickerOpen && (
        <div className="fc-modal-overlay" onClick={() => setGroupPickerOpen(false)}>
          <div className="fc-group-modal" onClick={e => e.stopPropagation()}>
            <h3 className="fc-group-modal-title">Add {selectedCardIds.size} Item{selectedCardIds.size !== 1 ? 's' : ''} to Group</h3>
            <div className="fc-group-picker-list">
              {groups.map(g => (
                <button key={g.id} type="button" className="fc-group-picker-item" onClick={() => handleAddToGroup(g.id)}>
                  <span>{g.name}</span>
                  <span className="fc-group-picker-count">{g.cardIds.length} item{g.cardIds.length !== 1 ? 's' : ''}</span>
                </button>
              ))}
            </div>
            <div className="fc-group-modal-actions">
              <button type="button" className="fc-action-btn" onClick={() => setGroupPickerOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
