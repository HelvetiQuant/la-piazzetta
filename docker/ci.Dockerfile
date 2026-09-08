# Runner di CI per La Piazzetta.
#
# Sostituisce le GitHub Actions: stessa pipeline, ma eseguita in locale o su
# qualsiasi macchina con Docker. Nessuna dipendenza da servizi esterni oltre al
# registry npm e al download dell'engine Prisma.
#
# Il codice NON viene copiato nell'immagine: è montato a runtime da
# docker-compose.ci.yml. Così il rebuild dell'immagine serve solo quando
# cambiano le dipendenze di sistema, non a ogni modifica del sorgente.

FROM node:22-bookworm-slim

# openssl: richiesto dall'engine Prisma.
# ca-certificates: download engine + registry npm.
# git: usato dallo step di verifica "working tree pulito".
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates git \
 && rm -rf /var/lib/apt/lists/*

# Il codemod e i test girano con lo strip-types nativo di Node 22: nessun
# transpiler aggiuntivo da installare.
ENV CI=true \
    NODE_ENV=development \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /repo

# Git rifiuta di operare su una working copy con owner diverso (il bind mount
# arriva con l'uid dell'host): la marchiamo come sicura.
RUN git config --global --add safe.directory /repo

ENTRYPOINT ["bash", "/repo/scripts/ci.sh"]
CMD ["all"]
