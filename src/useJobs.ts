import { useQuery } from '@tanstack/react-query';
import type { Job } from '../shared/types';
import { supabase } from './lib';
export function useJobs(enabled = true) {
  return useQuery({
    queryKey: ['jobs'],
    enabled,
    refetchInterval: 15000,
    queryFn: async () => {
      const r = await supabase!
        .from('sync_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (r.error) throw r.error;
      return r.data as Job[];
    },
  });
}
