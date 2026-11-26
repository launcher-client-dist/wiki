import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * Guides: one MDX file per language, in src/content/guides/<lang>/<slug>.mdx. The two languages of a guide share
 * `key` (the entity id: guide:<key>); the file name is the URL slug in that language.
 */
const guides = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/guides" }),
  schema: z.object({
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(3).max(70),
    /** The meta description and search excerpt: never spoiler text. */
    description: z.string().min(50).max(160),
    updated: z.coerce.date(),
    /** Lower comes first in lists. */
    order: z.number().int().default(100),
    /** Other entities to suggest at the end ("guide:glossary"). */
    related: z.array(z.string()).default([]),
  }),
});

export const collections = { guides };
