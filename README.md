# Dog-Food write-up (blog)

My write-up for the DOGFOOD 2026 Write-Up Quest. It's a static site: plain HTML, CSS and JavaScript, with no build step and no outside requests. It uses Dog-Food's own "paper and ink" stylesheet and the bundled IBM Plex fonts.

```
index.html              the post
assets/site.css         Dog-Food's stylesheet (unchanged)
assets/blog.css         article and lab styles
assets/blog.js          the 9 interactive labs
assets/fixture-data.js  the 122 counted reviews from fixtures.json (for Lab 3)
assets/fonts/           IBM Plex, SIL OFL
vercel.json             caching and security headers
```

## Preview locally

```
cd dogfood-blog
python -m http.server 8000
```

Then open http://localhost:8000. If you open index.html directly from the folder, the fonts are blocked, so use the server.

## Deploy on Vercel

**Option A, via GitHub (recommended):**

1. Create a new GitHub repo, for example `dogfood-writeup`, and push this folder to it.
2. On vercel.com, choose Add New, then Project, and import the repo.
3. Set Framework Preset to **Other**. Leave the build command empty and the output directory as `./`.
4. Click Deploy. You'll get a URL like `dogfood-writeup.vercel.app`.

**Option B, from the command line:**

```
npm i -g vercel
cd dogfood-blog
vercel          (answer the prompts; this gives you a preview link)
vercel --prod   (this gives you the live link)
```

After it's live, share the link on LinkedIn or X and tag **Hackathon Raptors**. The deadline is 5 Oct 2026, 18:00 UTC.
