/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('call_recordings', table => {
        table.increments('id').primary();
        table.string('call_id').unique().notNullable();
        table.string('customer_mobile_number');
        table.string('recording_url', 500);
        table.string('call_category');
        table.string('call_status');
        table.text('problem_inquiry');
        table.text('solution_response');
        table.text('transcription');
        table.datetime('start_stamp');
        table.datetime('end_stamp');
        table.string('agent_name');
        table.string('agent_number');
        table.string('did_number');
        table.string('duration');
        table.string('direction');
        table.json('raw_payload');
        table.timestamps(true, true);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable('call_recordings');
};
