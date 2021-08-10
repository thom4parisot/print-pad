/**
* This is the main Node.js server script for your project
* Check out the two endpoints this back-end API provides in fastify.get and fastify.post below
*/

const {get} = require("got")
const path = require("path");
const markdownit = require("markdown-it")
const markdownItAttrs = require("markdown-it-attrs")
const markdownitDeflist = require("markdown-it-deflist")
const markdownitContainer = require("markdown-it-container")
const markdownitAnchor = require("markdown-it-anchor")
const markdownitEmoji = require("markdown-it-emoji")
const seo = require("./src/seo.json");

const {BASE_PAD_URL} = process.env
const BASE_PAD_URL_RE = new RegExp(`^${BASE_PAD_URL}`, 'i')

const fastify = require("fastify")({ logger: false });

const md = new markdownit('default', {
    html: true,
    typographer: true,
    quotes: ['«\xA0', '\xA0»', '‹\xA0', '\xA0›']
  });

md.use(markdownItAttrs)
md.use(markdownitDeflist)
md.use(markdownitAnchor)
md.use(markdownitEmoji)
md.use(markdownitContainer, 'info')
md.use(markdownitContainer, 'warning')

// Setup our static files
fastify.register(require("fastify-static"), {
  root: path.join(__dirname, "public"),
  prefix: "/" // optional: default '/'
});

// fastify-formbody lets us parse incoming forms
fastify.register(require("fastify-formbody"));

// point-of-view is a templating manager for fastify
fastify.register(require("point-of-view"), {
  engine: {
    handlebars: require("handlebars")
  }
});

// Load and parse SEO data
if (seo.url === "glitch-default") {
  seo.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
}

const isAllowedUrl = (url) => {
  return BASE_PAD_URL_RE.test(url)
}

const MARKDOWN_METATAGS_RE = /^#+ tags\s?:(.+)$/m
const MARKDOWN_REMOVE_EVERYTHING_UNTIL_FIRST_HEADLINE_RE = /^[^#]+# /
const MARKDOWN_REMOVE_UNDERLINES = /\+\+([^+]+)\+\+/g

const cleanupMarkdown = (markdown) => {
  const md = markdown
    .replace(MARKDOWN_REMOVE_UNDERLINES, '$1')
    .replace(MARKDOWN_METATAGS_RE, '')
    .replace(MARKDOWN_REMOVE_EVERYTHING_UNTIL_FIRST_HEADLINE_RE, '# ')
  
  const additionalMetas = {
    tags: []
  }
  
  return [md, additionalMetas]
}

fastify.get("/", function(request, reply) {
  let params = { seo, BASE_PAD_URL };
  reply.view("/src/pages/index.hbs", params);
});

fastify.post("/", function(request, reply) {
  let params = { seo, BASE_PAD_URL };
  let {url} = request.body

  if (url) {
    const cleanedUrl = String(url).trim()
    
    if (isAllowedUrl(cleanedUrl)) {
      reply.redirect(302, `/print/${cleanedUrl}`)
    }
    // Error, not an allowed domain
    else {
      reply.view("/src/pages/index.hbs", {
        ...params,
        BASE_PAD_URL,
        error: "Ce domaine n'est pas autorisé."
      });
    }
  }
});

fastify.get("/print/*", async function (request, reply) {
  const url = request.params['*']
  
  // not allowed
  if (!isAllowedUrl(url)) {
    return reply.send(500)
  }
  
  const [rawBody, metas] = await Promise.all([
    get(`${url}/download`),
    get(`${url}/info`).json(),
  ]).then(([download, metas]) => {
    const [rawBody, additionalMetas] = cleanupMarkdown(download.body)
    
    return [rawBody, {...metas, ...additionalMetas}]
  })
  
  const html = md.render(rawBody)
    
  reply.view("/src/pages/print.hbs", {
    seo,
    metas,
    url,
    rawBody,
    html,
    BASE_PAD_URL
  })
})

// Run the server and report out to the logs
fastify.listen(process.env.PORT, function(err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Your app is listening on ${address}`);
  fastify.log.info(`server listening on ${address}`);
});
