#!/usr/bin/env node

'use strict';

const Webflow = require('webflow-api');
const lib = require('./lib');

module.exports = function(options) {
  const imports = {};
  imports.webflow = new Webflow({ token: options.token || options.apiToken });
  return lib(options, imports);
};
