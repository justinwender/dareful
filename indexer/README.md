# Dareful indexer (Envio HyperIndex)

The only chain reader in the stack. Indexes `DarefulLedger` and `DarefulDares` on Monad testnet and serves
GraphQL, including the `OpenBetween` query from PLANNING.md section 10.

From the repository root (loads `.env.local`, which supplies `MONAD_INDEXER_RPC_URL`):

```bash
npm run indexer:codegen   # after any change to config.yaml or schema.graphql
npm run indexer:dev       # local Postgres + Hasura in Docker, GraphQL at http://localhost:8080/v1/graphql
npm run indexer:test      # handler tests against a simulated chain
npm run indexer:stop      # stops the indexer and its containers and drops the local database
```

Stop the indexer before running the seed: on the Alchemy free tier its head polling alone saturates the request budget and the seed's transactions get HTTP 429. Killing the `npm` wrapper is not enough; the indexer child keeps running, so use `indexer:stop` or Ctrl-C in the terminal that started it.

Docker (or any Docker-compatible runtime) must be running for `indexer:dev`. With Colima, point the CLI at its socket first:

```bash
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
```
