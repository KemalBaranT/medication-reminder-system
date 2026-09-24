import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface HospitalSettings {
  hospitalName: string;
}

const DEFAULT_HOSPITAL_NAME = 'İlaç Takip Sistemi';

/** Musteri hastanenin markasini (adini) backend'deki tek satirlik ayardan okur.
 * Kimlik dogrulama gerektirmez, boylece giris ekraninda bile gosterilebilir. */
export function useHospitalSettings() {
  const { data } = useQuery<HospitalSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return { hospitalName: data?.hospitalName ?? DEFAULT_HOSPITAL_NAME };
}
