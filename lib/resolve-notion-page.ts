import { ExtendedRecordMap } from 'notion-types'
import { parsePageId } from 'notion-utils'

import * as acl from './acl'
import { environment, pageUrlAdditions, pageUrlOverrides, site } from './config'
import { db } from './db'
import { getSiteMap } from './get-site-map'
import { getPage } from './notion'

// import { createWriteStream, existsSync, mkdirSync } from 'fs'
// import { ReadableStream } from 'stream/web'
// import { finished } from 'stream/promises'
// import { Readable } from 'stream'

export async function resolveNotionPage(domain: string, rawPageId?: string) {
  let pageId: string
  let recordMap: ExtendedRecordMap

  if (rawPageId && rawPageId !== 'index') {
    pageId = parsePageId(rawPageId)

    if (!pageId) {
      // check if the site configuration provides an override or a fallback for
      // the page's URI
      const override =
        pageUrlOverrides[rawPageId] || pageUrlAdditions[rawPageId]

      if (override) {
        pageId = parsePageId(override)
      }
    }

    const useUriToPageIdCache = true
    const cacheKey = `uri-to-page-id:${domain}:${environment}:${rawPageId}`
    // TODO: should we use a TTL for these mappings or make them permanent?
    // const cacheTTL = 8.64e7 // one day in milliseconds
    const cacheTTL = undefined // disable cache TTL

    if (!pageId && useUriToPageIdCache) {
      try {
        // check if the database has a cached mapping of this URI to page ID
        pageId = await db.get(cacheKey)

        // console.log(`redis get "${cacheKey}"`, pageId)
      } catch (err) {
        // ignore redis errors
        console.warn(`redis error get "${cacheKey}"`, err.message)
      }
    }

    if (pageId) {
      recordMap = await getPage(pageId)
    } else {
      // handle mapping of user-friendly canonical page paths to Notion page IDs
      // e.g., /developer-x-entrepreneur versus /71201624b204481f862630ea25ce62fe
      const siteMap = await getSiteMap()
      pageId = siteMap?.canonicalPageMap[rawPageId]

      if (pageId) {
        // TODO: we're not re-using the page recordMap from siteMaps because it is
        // cached aggressively
        // recordMap = siteMap.pageMap[pageId]

        recordMap = await getPage(pageId)

        if (useUriToPageIdCache) {
          try {
            // update the database mapping of URI to pageId
            await db.set(cacheKey, pageId, cacheTTL)

            // console.log(`redis set "${cacheKey}"`, pageId, { cacheTTL })
          } catch (err) {
            // ignore redis errors
            console.warn(`redis error set "${cacheKey}"`, err.message)
          }
        }
      } else {
        // note: we're purposefully not caching URI to pageId mappings for 404s
        return {
          error: {
            message: `Not found "${rawPageId}"`,
            statusCode: 404
          }
        }
      }
    }
  } else {
    pageId = site.rootNotionPageId
    recordMap = await getPage(pageId)
  }
  
  // const { signed_urls } = recordMap

  // if(Object.keys(signed_urls).length > 0) {
  //   for (const blockId in signed_urls) {
  //     try{
  //       const signedUrl = signed_urls[blockId]
  //       const destination = `./images/${blockId}.png`

  //       if (!signedUrl.includes("expirationTimestamp") || existsSync(destination)) continue

  //       const image = await fetch(signedUrl)

  //       recordMap.signed_urls[blockId] = `https://localhost:3000/images:${blockId}.png`

  //       const fileStream = createWriteStream(destination, { flags: 'wx' })
  //       await finished(Readable.fromWeb(image.body as unknown as ReadableStream).pipe(fileStream))

  //     } catch(error: unknown) {}
  //   }
  // }

  const props = { site, recordMap, pageId }
  return { ...props, ...(await acl.pageAcl(props)) }
}
