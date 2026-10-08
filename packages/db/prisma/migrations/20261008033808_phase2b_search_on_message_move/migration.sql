-- Merging and splitting tickets move messages between tickets. Refresh the search vector
-- of both the ticket a message left and the one it joined, not only when its text changes.

CREATE OR REPLACE FUNCTION ticket_messages_search_vector_refresh() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE tickets SET subject = subject WHERE id = OLD.ticket_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.ticket_id <> OLD.ticket_id) THEN
    UPDATE tickets SET subject = subject WHERE id = NEW.ticket_id;
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER ticket_messages_search_vector_refresh ON ticket_messages;

CREATE TRIGGER ticket_messages_search_vector_refresh
  AFTER INSERT OR DELETE OR UPDATE OF body_text, ticket_id ON ticket_messages
  FOR EACH ROW EXECUTE FUNCTION ticket_messages_search_vector_refresh();
