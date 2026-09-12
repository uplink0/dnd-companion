# D&D Realm — implementation status

## Current game-state guarantees

- The active character owns chat, inventory, discoveries, journal entries and character-scoped game events.
- Player chat actions can carry a `clientActionId`; the server stores an idempotency receipt per campaign, character and action.
- A failed AI response leaves the player message persisted with a failed status so it can be retried.
- Scene items are separate from inventory: an item must be discovered before it can be taken.
- `RECEIVE_ITEM` is only valid for an available scene item belonging to the same character and campaign.
- Item characteristics are normalized server-side and rarity/effect power is capped by character level.
- The AI Master receives the character inventory and available scene items as context.

## Multi-account boundary

The database already has `users`, `campaigns.owner_id`, `campaign_members` and `characters.user_id`. The current application does not yet have end-user authentication/session middleware, so these ownership fields are not sufficient by themselves for production multi-account isolation.

Before opening the service to multiple real users, add authenticated sessions and require every character/campaign/inventory/event query to authorize the current user through campaign membership or character ownership. Do not trust `userId`, `campaignId` or `characterId` supplied by the browser as proof of ownership.
