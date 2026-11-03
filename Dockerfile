FROM node:22.23.0-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3080
WORKDIR /app
COPY --chown=node:node package.json server.mjs persistence.mjs auth.mjs ./
COPY --chown=node:node public ./public
USER node
EXPOSE 3080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
