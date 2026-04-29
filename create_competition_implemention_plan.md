Competition Creation Flow Update
This plan outlines the steps to complete the frontend and backend of the Competition Creation flow, ensuring all schema fields are handled, images are uploaded correctly, and the new structure maps gracefully to the existing UI.

User Review Required
Image Upload: We will use Firebase Storage to upload images from the frontend before calling the Cloud Function.
Card UI & dummy data: Currently, FeaturedCompetitions and other places use dummy data (src/data/competitions.js). The focus of this task is the Creation Flow. However, we will ensure that the created schema maps perfectly to the fields required by the UI (e.g. total_tickets, sold_tickets, draw_date -> endsAt, etc.) so that when the UI is updated to fetch real data, the card design will remain identical to the current dummy one.
Open Questions
Does the UI currently fetch from Firestore or is it purely dummy data for the user view? (I assume dummy for now, but I will ensure the schema supports the exact visual requirements of the dummy data).
For competitionController.js, do you want to restrict image uploads to the Cloud Function, or is uploading from the frontend client to Firebase Storage and passing the URLs to the function acceptable? (Standard practice is client -> Firebase Storage -> Pass URLs to Cloud Function. We will use this approach).
Proposed Changes
Backend Integration
[MODIFY] 
competitionController.js
Ensure all schema fields are pulled from competitionData (e.g. status, included_things, prize_video_url, instagram_live_url, is_featured, winner_comment, etc.).
Ensure countdown_end uses admin.firestore.Timestamp.fromMillis correctly if provided.
Initialize schema default fields (winner_ref, winner_ticket_ref, participants as empty/null).
[MODIFY] 
index.js
Export createCompetition from ./controllers/competitionController.js.
Frontend API & Services
[MODIFY] 
firebase.js
Export getStorage and getFunctions so they can be used for image uploads and Cloud Function calls.
[NEW] 
competitionService.js
Create a service to handle uploading images to Firebase Storage (uploadBytes, getDownloadURL).
Create a method to call the createCompetition Cloud Function using httpsCallable.
Frontend UI Components
[MODIFY] 
CompetitionForm.jsx
New Fields:
status: Add a dropdown (Active, Upcoming, Draft, Ended).
included_things: Add a dynamic input list (add/remove strings).
prize_video_url: Add a URL input field.
draw_date & countdown_end: Unify or adjust inputs to use standard datetime pickers.
Dynamic Questions: Maintain the existing dynamic multiple question & multiple option creation but ensure we output the exact shape for options (List<Map>) and answer (Map).
Pass the comprehensive formData to onSubmit.
[MODIFY] 
CreateCompetition.jsx
Import competitionService.js.
Implement the onSubmit logic:
Set a loading state.
Upload all competition images to Firebase Storage.
Upload all question images to Firebase Storage.
Construct the final payload to match the schema.
Call createCompetition via the service.
Handle success/error states (toast notifications, redirect on success).
Verification Plan
Automated Tests
None specified.
Manual Verification
Fill out the Create Competition form completely.
Add multiple images, video URLs, and dynamic included things.
Add multiple questions, each with an image, and dynamic options, selecting the correct one.
Submit the form. Verify Firebase Storage contains the new images.
Verify Firestore competition collection contains the document with all correct fields.
Verify Firestore questions collection contains the related question documents linked by competition_id.