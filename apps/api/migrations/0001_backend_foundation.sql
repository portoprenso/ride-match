-- Reserve the server-owned namespace; domain tables belong to later slices.
CREATE SCHEMA ride_match;
COMMENT ON SCHEMA ride_match IS 'Ride Match backend domain storage';
