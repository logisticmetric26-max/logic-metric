-- =============================================================================
-- Remove synthetic rejected legacy reviews
-- =============================================================================
-- The legacy spreadsheet did not contain departure/return timestamps, actors,
-- rejection reasons, documents, or analysis records. The previous import
-- projected rejected spreadsheet rows as complete review events by inventing
-- those missing fields. This made them appear in the operational rejected list
-- with a synthetic actor, zero reasons, and no analysis.
--
-- The cleanup is deliberately restricted to the exact signature produced by
-- that import. Reviews created through the application are not affected.
-- =============================================================================

delete from public.technical_review_events
where driver_name = 'IMPORTACION HISTORICA'
  and status = 'CLOSED'
  and result = 'REJECTED'
  and created_by = closed_by
  and return_at = departure_at + interval '5 minutes';

-- These fallback expirations were populated exclusively from the same rejected
-- spreadsheet rows and must not survive after their source is withdrawn.
delete from app.fleet_legacy_expirations
where source_result = 'REJECTED_HISTORY_IMPORT';
