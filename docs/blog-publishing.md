# EXACTMEC blog publishing

The blog covers aluminum die casting mold engineering. It should answer a technical question that is distinct from the existing quotation, cost and project-process guides.

## Add an article

1. Add a unique `blog-*` object to `src/data/blog-articles.json`. Use a `/blog/<slug>/` path, a clear H1 and description, a topic used by the filters, a date, sections with unique IDs, and a concise takeaway.
2. Check technical claims against a primary source. Add the source URL and label to the article. Write original explanations; do not copy competitor text or imply that an illustrative diagram is a customer project.
3. Run `npm run blog:sync`. This registers the URL in the public route list and creates its editable content baseline.
4. Run `npm run build:release`, `npm run test:frontend`, and `npm run test:backend`. Review the article in the browser, including its mobile layout, links, canonical URL and sitemap entry.
5. Publish the reviewed build through the normal EXACTMEC deployment process.

The current admin content editor can revise and withdraw registered articles. Creating a new URL still requires adding the article source and deploying a build; the admin editor does not create new routes.
