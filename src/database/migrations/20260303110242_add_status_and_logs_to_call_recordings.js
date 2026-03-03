exports.up = function (knex) {
    return knex.schema.alterTable('call_recordings', table => {
        table.string('processing_status').defaultTo('pending').index();
        table.text('error_log');
        table.datetime('last_processed_at');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('call_recordings', table => {
        table.dropColumn('processing_status');
        table.dropColumn('error_log');
        table.dropColumn('last_processed_at');
    });
};
