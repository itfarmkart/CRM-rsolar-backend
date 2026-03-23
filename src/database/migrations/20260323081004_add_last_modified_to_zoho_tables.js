/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .alterTable('zoho_payments', function(table) {
      table.timestamp('last_modified_time').index();
    })
    .alterTable('zoho_estimates', function(table) {
      table.timestamp('last_modified_time').index();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .alterTable('zoho_payments', function(table) {
      table.dropColumn('last_modified_time');
    })
    .alterTable('zoho_estimates', function(table) {
      table.dropColumn('last_modified_time');
    });
};
