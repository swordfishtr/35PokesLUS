# 35 Pokes Live Usage Stats

> [!CAUTION]
> This project is no longer maintained.

This is a Pokemon Showdown bot that periodically checks for new ongoing battles and collects usage statistics from them. Stats are stored in a SQLite database at `/data/lus.db` and optionally served over HTTP. The bot is capable of automatic reconnection, but won't spam the server if it fails multiple times in a row. The bot functions as a guest - no accounts needed.

> [!NOTE]
> Only public battles are visible to the bot! If either player has disabled spectators, the bot will miss that battle.

## Usage

Download this repository.

Copy a Pokemon Showdown `pokedex.js`, either from client or server, to `/data/pokedex.js`. You can download one from [main Pokemon Showdown](https://play.pokemonshowdown.com/data/pokedex.js). Get a fresh one whenever new Pokemon release.

Install npm and Node v24 from their website or via nvm.

Run `npm install`.

Run `npx tsc` - this will build the project to `/dist`.

Optionally edit `config.json` to your liking.

Run `node dist/Main.js`.

## config.json

`debug`: boolean

Does nothing

`port`: number | string | null

This is the port that live usage stats will be served from. Given a number, will attempt to use that port. Given a string, will attempt to read a number from that environment variable to use as port. `null` disables the server completely.

`formats`: string[]

This is the list of formats to collect usage stats from. The format of each battle is stored in the database for clarity.

`rankedOnly`: boolean

If true, will only collect stats from ranked ladder battles. The ranked state of each battle is NOT stored in the database.

`interval`: number

Number of seconds to wait between each query for ongoing battles. Minimum 30.

## Live usage stats server API

The server responds with a JSON object that maps unique battle room names (ex: "battle-gen9nationaldex35pokes-2675568963") for keys and an array of each Pokemon's ID for values. Pokemon IDs can repeat if both players brought the same Pokemon. An empty `{}` means that the bot has not found a battle yet.

`GET /`

Returns all usage data in the database.

`GET /:group/:meta`

Returns all usage data filtered by the 35 Pokes metagame specified. If a battle contains a Pokemon that is not part of the specified metagame, that battle is excluded from the results. See [35 Pokes Index](https://github.com/swordfishtr/35PokesIndex) for available groups and metas.

Ex: `GET /2026/2026_09` for the September 2026 metagame.

## Credits

This project includes code from:

[Pokemon Showdown](https://github.com/smogon/pokemon-showdown)

[35 Pokes Extension](https://github.com/swordfishtr/35PokesExtension)

[nanotar](https://github.com/unjs/nanotar)
