CREATE POLICY "read own jarvis images" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'jarvis-images' AND (storage.foldername(name))[1] = auth.uid()::text);