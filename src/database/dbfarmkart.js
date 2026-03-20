const knex = require('knex');
const knexConfig = require('../../knexfileFarmkart');

const environment = process.env.NODE_ENV || 'development';
const connection = knex(knexConfig[environment]);

module.exports = connection;
