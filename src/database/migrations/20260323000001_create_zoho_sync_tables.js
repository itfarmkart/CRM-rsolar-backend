exports.up = function(knex) {
  return knex.schema
    .createTable('zoho_payments', function(table) {
      table.increments('id').primary();
      table.string('payment_id').unique().notNullable();
      table.string('customer_id');
      table.string('mobile_number').index();
      table.string('customer_name');
      table.decimal('amount', 15, 2);
      table.decimal('unused_amount', 15, 2);
      table.date('date');
      table.string('account_name');
      table.string('reference_number');
      table.timestamp('createdAt').defaultTo(knex.fn.now());
    })
    .createTable('zoho_estimates', function(table) {
      table.increments('id').primary();
      table.string('estimate_id').unique().notNullable();
      table.string('estimate_number');
      table.string('mobile_number').index();
      table.string('customer_name');
      table.date('date');
      table.decimal('total', 15, 2);
      table.string('billing_phone');
      table.timestamp('createdAt').defaultTo(knex.fn.now());
    })
    .createTable('zoho_sales_orders', function(table) {
      table.increments('id').primary();
      table.string('salesorder_id').unique().notNullable();
      table.string('salesorder_number');
      table.string('mobile_number').index();
      table.string('customer_name');
      table.string('status');
      table.decimal('total', 15, 2);
      table.timestamp('last_modified_time');
      table.timestamp('createdAt').defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('zoho_sales_orders')
    .dropTableIfExists('zoho_estimates')
    .dropTableIfExists('zoho_payments');
};
