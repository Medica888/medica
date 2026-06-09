'use strict';

exports.up = (pgm) => {
  pgm.createTable('generated_bank_audit_log', {
    id:              { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id:         { type: 'uuid', notNull: false },
    action:          { type: 'varchar(50)', notNull: true },
    question_id:     { type: 'varchar(300)', notNull: true },
    previous_status: { type: 'varchar(50)', notNull: false },
    new_status:      { type: 'varchar(50)', notNull: false },
    created_at:      { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('generated_bank_audit_log', 'question_id');
  pgm.createIndex('generated_bank_audit_log', 'created_at');
  pgm.createIndex('generated_bank_audit_log', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('generated_bank_audit_log');
};
