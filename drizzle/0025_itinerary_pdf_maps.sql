-- H3: the itinerary PDF now prints each day's places with a Google Maps link.
-- Data only: forget the generated PDFs so the worker's sweep renders every
-- published itinerary again (same version, so buyers keep their version).
-- An uploaded PDF (itineraries.uploaded_pdf_keys) is not touched.
DELETE FROM "itinerary_documents";
