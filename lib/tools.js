'use strict';

const eelog = require('eelog');

const log = new eelog({
  level: (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') ? 'debug' : 'info',
  name: 'bodaboda'
});

exports.log = log;
