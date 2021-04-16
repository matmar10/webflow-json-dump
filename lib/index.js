#!/usr/bin/env node

'use strict';

const Webflow = require('webflow-api');
const camelCase = require('camel-case').camelCase;
const Promise = require('bluebird');
const objectMapper = require('object-mapper');
const util = require('util');
const ora = require('ora');
const yargs = require('yargs');

// local cache of these to avoid exessive round trips when recursing
const collectionSchemasById = {};
const collectionItemsById = {};

module.exports = function(options, imports) {

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
    if (!itemRefSet || !itemRefSet.length) {
      return [];
    }
    return await Promise.map(itemRefSet, async (itemRef) => {
      return await getItemRef(itemRef, field, rootCollectionId);
    }, { concurrency: 1 });
  }

  function getItemOptionValue(optionId, field) {
    const { options } = field.validations;
    const option = options.find(option => option.id === optionId);
    if (!option) {
      throw new Error(`Could not find option.id=${option.id}`);
    }
    return option.name;
  }

  async function getFieldValue(item, fieldDef, rootCollectionId) {
    const fieldName = camelCase(fieldDef.slug);
    const rawValue = item[fieldDef.slug];
    if (fieldDef.name === 'Financial Currency') {
      console.error('FIELD DEF:', fieldDef);
    }
    switch (fieldDef.type) {
      case 'ItemRef':
        return await getItemRef(rawValue, fieldDef, rootCollectionId);
      case 'ItemRefSet':
        return await getItemRefSet(rawValue, fieldDef, rootCollectionId);
      case 'Option':
        const option = getItemOptionValue(rawValue, fieldDef);
        return option;
      default:
        return rawValue;
    }
  }

  async function getPopulatedItem(item, collectionId, rootCollectionId) {
    const fullSchema = await getCollectionSchemasById(collectionId);
    const fullRootSchema = await getCollectionSchemasById(rootCollectionId);
    const { fields } = fullSchema;
    const populated = {};

    // pick up scalar fields like _id, etc.
    const keys = Object.keys(item);
    keys.forEach((key) => {
      const camelCaseKey = camelCase(key);
      populated[camelCaseKey] = item[key];
    });

    // pick up all fields, including non-scalar
    await Promise.each(fields, async (fieldDef) => {
      const value = await getFieldValue(item, fieldDef, rootCollectionId);
      const fieldName = camelCase(fieldDef.slug);
      populated[fieldName] = value;
    });
    return populated;
  }

  function deletePropertyAtPath(obj, path) {
    const paths = path.split('.');
    let value = obj;
    while (paths.length > 1) {
      const name = paths.shift();
      value = value[name];
    }
    delete value[ paths.shift()];
  }

  async function getPopulatedItems(items, collectionId, rootCollectionId) {
    rootCollectionId = rootCollectionId ? rootCollectionId : collectionId;
    let output;

    // populate all items, recursively (until circular link detected)\
    output = await Promise.map(items, (item) => getPopulatedItem(item, collectionId, rootCollectionId), { concurrency: 1 });

    // if any special additional mapping requested
    // merge those properties atop the default schema
    if (options.map) {
      output = output.map(item => {
        // add new keys
        const newProperties = objectMapper(item, options.map);
        // remove old keys
        const oldKeys = Object.keys(options.map);
        oldKeys.forEach(srcProperty => deletePropertyAtPath(item, srcProperty));
        // merge original remaining plus new
        return {
          ...item,
          ...newProperties,
        };
      });
    }

    if (options.index) {
      const indexed = {};
      const indexField = 'id' === options.indexBy ? '_id' : options.indexBy;
      output.forEach(item => {
        const indexId = item[indexField];
        indexed[indexId] = item;
      });
      output = indexed;
    }

    return output;
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
    const collections = await imports.webflow.collections({ siteId: options.siteId });
    const collection = collections.find(collection => name === collection.name || name === collection.singularName);
    if (!collection) {
      throw new Error(`Not found: Collection.name=${name}`);
    }
    return collection;
  }

  return {
    getCollectionByName,
    getCollectionSchemasById,
    getFieldValue,
    getItemRef,
    getItemRefSet,
    getItemsForCollectionById,
    getPopulatedItems,
    getPopulatedItem,
  };
};
