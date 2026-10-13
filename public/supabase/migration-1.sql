update storage.buckets
set file_size_limit = 3145728  -- 3 MB in bytes (3 * 1024 * 1024)
where name = 'message-images';