-- Human-facing order references (BT-2026-0184).
--
-- A sequence rather than count(*) + 1: counting rows is a classic
-- collision under concurrency, and orders.order_number carries a UNIQUE
-- constraint that would reject whichever checkout lost the race. nextval
-- is atomic and never hands the same value to two callers.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1 INCREMENT BY 1;
