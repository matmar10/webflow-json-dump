#!/usr/bin/env node

'use strict';

const Webflow = require('webflow-api');
const camelCase = require('camel-case').camelCase;
const Promise = require('bluebird');
const util = require('util');
const ora = require('ora');
const yargs = require('yargs');
const api = require('./../');


async function run(argv) {
  const meta = {};
  const spinner = ora();

  const start = (stepDescription) => {
    meta.step = stepDescription;
    if (!argv.silent) {
      spinner.start(`${meta.step}...`);
    }
  };
  const end = (stepDescription) => {
    if (!argv.silent) {
      spinner.succeed(`${stepDescription || meta.step} OK`);
    }
  };

  try {
    start('Bootstrapping');
    const {
      getCollectionByName,
      getItemsForCollectionById,
      getPopulatedItems,
    } = api(argv);

    start('Initialize Webflow API');
    const { collectionName } = argv;
    start(`Get ${collectionName} Collection`);
    const collection = await getCollectionByName(collectionName);
    end();

    start(`Get ${collectionName} Items`);
    const items = await getItemsForCollectionById(collection._id);
    end();

    start(`Populate all fields for ${items.length} ${collectionName} item(s)`);
    const output = await getPopulatedItems(items, collection._id);
    end();

    if (argv.dump) {
      const str = JSON.stringify(output, null, 2);
      console.log(str);
    }
  } catch (err) {
    spinner.fail(`ERROR ${meta.step}: ${err}`);
    console.error(err);
  }
}

yargs
  .command({
    command: '$0 <collectionName>',
    desc: 'Fetch all items in the specified collection, fully populated in a JSON dump',
    builder: (yargs) => {
      yargs
        .positional('collectionName', {
          type: 'string',
          description: 'The Webflow Collection name',
          demandOption: true,
        })
        .option('verbose', {
          alias: ['v'],
          type: 'boolean',
          description: 'Log progress and verbose output',
          default: false
        })
        .option('dump', {
          alias: ['d'],
          type: 'boolean',
          description: 'Whether to dump the JSON result as stdout',
          default: true
        })
        .option('index', {
          alias: ['x'],
          type: 'boolean',
          description: 'If false, output is an array. If set to true, items are indexed by the indexBy option (either slug or id)',
          default: true
        })
        .option('indexBy', {
          alias: ['b'],
          type: 'string',
          choices: ['slug', 'id', 'name'],
          description: 'What field should be used to index the items in the final output object',
          default: 'slug'
        })
        .option('apiToken', {
          alias: ['k'],
          type: 'string',
          description: 'The Webflow API token (defaults to WEBFLOW_TOKEN env var)',
          default: process.env.WEBFLOW_API_TOKEN
        })
        .option('siteId', {
          alias: ['i'],
          type: 'string',
          description: 'The Webflow site ID (defaults to WEBFLOW_SITE_ID env var)',
          default: process.env.WEBFLOW_SITE_ID
        })
        .option('silent', {
          alias: ['s'],
          type: 'boolean',
          description: 'If enabled, hides all logging unless there is an error',
          default: false
        })
        .option('map', {
          alias: ['m'],
          type: 'string',
          description: 'Map source properties to specified destination (uses object-mapper library)',
        })
      ;
    },
    handler: argv => run(argv),
  })
  .demandCommand(1)
  .parse();
