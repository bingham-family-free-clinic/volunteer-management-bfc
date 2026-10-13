update storage.buckets
set file_size_limit = 20971520  -- 20 MB in bytes (20 * 1024 * 1024)
where name = 'message-images';