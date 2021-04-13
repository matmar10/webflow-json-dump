#!/usr/bin/env node

'use strict';

const Webflow = require('webflow-api');
const camelCase = require('camel-case').camelCase;
const Promise = require('bluebird');
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
