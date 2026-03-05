/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('call_recordings', table => {
        table.integer('customerExist').defaultTo(0).comment('1 for exist, 0 for not exist');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('call_recordings', table => {
        table.dropColumn('customerExist');
    });
};
