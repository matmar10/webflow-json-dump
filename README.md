# Webflow JSON dump

## Why?

Because (choose one or more)

1. Webflow doesn't have a public GraphQL API yet, and
2. Webflow's REST API is very chatty, requiring many round trips
3. You want to cache some infrequently changing content used someplace
4. You need a quick & simple way to cache or backup content
5. You cringe at the idea of parsing CSV files

## How

```Bash

# Install it globally, if you like)
npm install -g webflow-json-dump

webflow-json-dump Posts --api-key [your API key] --site-id [your site ID]

# or use env variables to make it easier
export WEBFLOW_API_TOKEN="[your Webflow API token]"
export WEBFLOW_SITE_ID="[your Webflow site ID]"
webflow-json-dump Posts
```

You can redirect stdout to a file to create an instantly, usable JSON cache version:

```Bash
webflow-json-dump Posts > posts.json
```

## CLI Usage

```Bash
# this will show you how:
webflow-json-dump --help
```

## API & Programmatic Usage

```JavaScript
const webflowJsonDump = require('webflow-json-dump');

(async () => {
  // bootstrap the lib
  const { getCollectionByName, getItemsForCollectionById, getPopulatedItems } = webflowJsonDump({
    apiKey: '[your api key]',
    siteId: '[your site ID]'
  });

  // use it
  const collection = await getCollectionByName('Posts');
  const items = await getItemsForCollectionById(collection._id);
  const populatedItems = await getPopulatedItems(items, collection._id);
})();
```
