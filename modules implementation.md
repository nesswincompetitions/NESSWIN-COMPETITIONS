# Modules Implementation

## Module: src/modules/user/auth/services/authService.js

- Flow:
- Validate user session and username
- If referral code provided, look up referrer by `referral_code`
- Block invalid code and self-referral
- Transaction writes: update current user; create referral IOU doc

- Referral IOU fields written to `referrals/{id}`:
- `referrer_id` DocumentReference
- `referred_user_id` DocumentReference
- `referral_code` string
- `reward_type` = `free_ticket`
- `reward_value` number
- `reward_issued` boolean (always `false` at creation)
- `reward_issued_at` null
- `created_at` serverTimestamp

- Edge cases handled:
- Invalid referral code
- Self-referral
- Duplicate referral usage on re-entry
- Missing user doc

## Module: src/modules/user/referrals/services/referralService.js

- Flow:
- Query pending rewards where `referrer_id == currentUserRef` and `reward_issued == false`
- Claim uses one batch: update referral docs + increment user totals

- Edge cases handled:
- Empty reward query results
- Already claimed rewards
- Invalid reward payload
- Stale UI state (referrer mismatch)
- Deleted user
- Race conditions (precondition on update time)
- Missing referral docs during claim

## Module: src/modules/user/profile/pages/ProfilePage.jsx

- Flow:
- On load: fetch pending rewards for current user
- UI shows pending count and claim button
- Claim triggers batch claim, then refreshes pending list

- Edge cases handled:
- Stale UI state (refresh after claim attempt)

## Required index

- Collection: referrals
- Fields: referrer_id (ASC), reward_issued (ASC)
- Query: where referrer_id == userRef AND reward_issued == false

# Module Documentation

## Module: src/modules/admin/competitions/components/CompetitionForm.jsx

- Purpose:
- Multi-step Admin Create Competition form UI.
- Collects all schema-required input fields and skill questions.

- Form fields now included:
- `title` (string)
- `description` (string)
- `category` (string)
- `tag` (string)
- `prizeName` (mapped to `prize_name`)
- `prizeVideoUrl` (mapped to `prize_video_url`)
- `instagramLiveLink` (mapped to `instagram_live_url`)
- `ticketPrice` (mapped to `ticket_price`)
- `prizeValue` (mapped to `prize_value`)
- `maxTickets` (mapped to `total_tickets`)
- `drawEndDate` + `drawEndTime` (mapped to Firestore `draw_date`)
- `includedThings` (mapped to `included_things`)
- `isFeatured` (mapped to `is_featured`)
- `images` (uploaded, mapped to `image` URL array)

- UI changes:
- Removed subtitle field usage from state and preview path.
- Added required `tag` input.
- Kept `prize video URL` input as part of required schema contract.

- Edge cases handled:
- Required-step validation for title, description, tag, prize fields, and image presence.
- Draft save path remains available without forcing final publish.

## Module: src/modules/admin/competitions/services/competitionService.js

- Purpose:
- Direct React Firebase SDK flow for competition creation and draft save.
- No Cloud Function dependency for create flow.

- Create flow (publish + draft):
1. Resolve document reference (`competition/{id}` if draft resume, else new doc).
2. Upload competition image files to Firebase Storage first.
3. Wait for download URLs.
4. Build Firestore payload strictly matching required schema fields.
5. Add required system defaults programmatically.
6. `setDoc(..., { merge: true })` on competition document.
7. Replace linked skill questions in `questions` collection for this competition.
8. Show success toast and return created/updated competition id.

- Firestore competition document fields written:
- Admin provided:
- `title` string
- `description` string
- `category` string
- `tag` string
- `prize_name` string
- `prize_video_url` string
- `instagram_live_url` string
- `ticket_price` number
- `prize_value` number
- `total_tickets` integer
- `draw_date` Firestore Timestamp or null
- `included_things` string[]
- `is_featured` boolean
- `image` string[] (download URLs from Storage uploads)

- System defaults:
- `status` -> `active` for publish, `draft` for draft save
- `stock_quantity` -> equals `total_tickets`
- `sold_tickets` -> `0` (or preserved when resuming)
- `last_ticket_sequence` -> `0` (or preserved when resuming)
- `participants` -> `[]` (or preserved when resuming)
- `winner_comment` -> `null` (or preserved when resuming)
- `winner_rating` -> `null` (or preserved when resuming)
- `winner_ticket_ref` -> `null` (or preserved when resuming)
- `winner_ref` -> `null` (or preserved when resuming)
- `created_at` -> `serverTimestamp()` (preserved on resume)
- `updated_at` -> `serverTimestamp()`

- Error handling and UX feedback:
- Wrapped in try/catch.
- Loading toast during processing.
- Success toast on completion.
- Error toast on failure, then rethrow.

## Module: src/modules/admin/competitions/pages/CreateCompetition.jsx

- Purpose:
- Orchestrates create draft/publish flow using direct SDK service.

- Flow:
1. If `?id=` is present, fetch draft document + related questions.
2. Map Firestore fields into form state shape.
3. On `Save Draft`, call SDK service with `isDraft=true`.
4. On `Publish`, call SDK service with `isDraft=false`.
5. Navigate back to competition list on success.

- Notes:
- Competition image uploads and question image uploads are handled inside the service.
- No callable function is invoked for create flow.

## Module: src/modules/admin/competitions/services/adminCompetitionService.js

- Changes made:
- Removed legacy callable `createCompetition` wrapper.
- Updated `deleteCompetition` to also delete linked `questions` docs in one batch to avoid orphan data.
- Added list subtitle fallback to `tag` because subtitle is no longer part of creation schema.

