-- Ratings still contribute to reputation, without notifying the other participant.
drop trigger if exists notify_rating on public.reputacion;
delete from public.activity_notifications where type='rating_received';
