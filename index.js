#!/usr/bin/env node

'use strict';

const Webflow = require('webflow-api');
const camelCase = require('camel-case').camelCase;
const Promise = require('bluebird');
const util = require('util');
const ora = require('ora');
const yargs = require('yargs');

const meta = {};
const imports = {};
const collectionSchemasById = {};
const collectionItemsById = {};

async function getItemRef(itemId, field, rootCollectionId) {
  const { collectionId } = field.validations;
  if (collectionId === rootCollectionId) {
    return itemRef;
  }
  const fullSchema = await getCollectionSchemasById(collectionId);
  const item = await imports.webflow.item({ collectionId, itemId });
  return await getPopulatedItem(item, collectionId, rootCollectionId);
}

async function getItemRefSet(itemRefSet, field, rootCollectionId) {
  return await Promise.map(itemRefSet, async (itemRef) => {
    return await getItemRef(itemRef, field, rootCollectionId);
  }, { concurrency: 1 });
}

async function getFieldValue(item, fieldDef, rootCollectionId) {
  const fieldName = camelCase(fieldDef.slug);
  const rawValue = item[fieldDef.slug];
  switch (fieldDef.type) {
    case 'ItemRef':
      return await getItemRef(rawValue, fieldDef, rootCollectionId);
    case 'ItemRefSet':
      return await getItemRefSet(rawValue, fieldDef, rootCollectionId);
    default:
      return rawValue;
  }
}

async function getPopulatedItem(item, collectionId, rootCollectionId) {
  const fullSchema = await getCollectionSchemasById(collectionId);
  const fullRootSchema = await getCollectionSchemasById(rootCollectionId);
  const { fields } = fullSchema;
  const populated = {};
  await Promise.each(fields, async (fieldDef) => {
    const value = await getFieldValue(item, fieldDef, rootCollectionId);
    const fieldName = camelCase(fieldDef.slug);
    populated[fieldName] = value;
  });
  return populated;
}

async function getPopulatedItems(items, collectionId, rootCollectionId) {
  rootCollectionId = rootCollectionId ? rootCollectionId : collectionId;
  return await Promise.map(items, (item) => getPopulatedItem(item, collectionId, rootCollectionId), { concurrency: 1 });
}

async function getItemsForCollectionById(collectionId) {
  if (collectionItemsById[collectionId]) {
    return collectionItemsById[collectionId];
  }
  const res = await imports.webflow.items({ collectionId });
  collectionItemsById[collectionId] = res.items;
  return collectionItemsById[collectionId];
}

async function getCollectionSchemasById(collectionId) {
  if (collectionSchemasById[collectionId]) {
    return collectionSchemasById[collectionId];
  }
  collectionSchemasById[collectionId] = await imports.webflow.collection({ collectionId });
  return collectionSchemasById[collectionId];
}

async function getCollectionByName(name) {
  const collections = await imports.webflow.collections({ siteId: meta.siteId });
  const collection = collections.find(collection => name === collection.name || name === collection.singularName);
  if (!collection) {
    throw new Error(`Not found: Collection.name=${name}`);
  }
  return collection;
}

async function run(argv) {
  imports.spinner = ora();
  meta.siteId = argv.siteId;

  const start = (stepDescription) => {
    meta.step = stepDescription;
    if (!argv.silent) {
      imports.spinner.start(`${meta.step}...`);
    }
  };
  const end = (stepDescription) => {
    if (!argv.silent) {
      imports.spinner.succeed(`${stepDescription || meta.step} OK`);
    }    
  };
  try {
    start('Initialize Webflow API');
    imports.webflow = new Webflow({ token: argv.apiToken });

    const { collectionName } = argv;
    start(`Get ${collectionName} Collection`);
    const collection = await getCollectionByName(collectionName);
    end();

    start(`Get ${collectionName} Items`);
    const items = await getItemsForCollectionById(collection._id);
    end();

    start(`Populate all fields for ${items.length} ${collectionName} item(s)`);
    const populatedItems = await getPopulatedItems(items, collection._id);
    end();

    populatedItems.forEach(item => console.log(util.inspect(item, { depth: 10 })));

    if (argv.dump) {
      const str = JSON.stringify(populatedItems, null, 2);
      console.log(str);
    }
  } catch (err) {
    imports.spinner.fail(`ERROR ${meta.step}: ${err}`);
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
      ;
    },
    handler: argv => run(argv),
  })
  .demandCommand(1)
  .parse();
