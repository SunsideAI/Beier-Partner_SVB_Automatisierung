import axios from 'axios';
import { config } from '../config';
import logger from '../utils/logger';

interface GenderResponse {
  gender: 'male' | 'female' | 'unknown';
  accuracy: number;
  name: string;
}

type Anrede = 'Sehr geehrter Herr' | 'Sehr geehrte Frau' | 'Guten Tag';

/**
 * Determines salutation based on first name via Gender API.
 * Falls back to "Guten Tag" on error or unknown gender.
 */
export async function getAnrede(firstName: string): Promise<Anrede> {
  try {
    const res = await axios.get<GenderResponse>('https://gender-api.com/get', {
      params: { name: firstName, key: config.genderApi.key },
      timeout: 5000,
    });

    const { gender } = res.data;
    logger.info({ firstName, gender }, 'Gender API result');

    if (gender === 'male') return 'Sehr geehrter Herr';
    if (gender === 'female') return 'Sehr geehrte Frau';
    return 'Guten Tag';
  } catch (error) {
    logger.warn({ firstName, error }, 'Gender API failed, using fallback');
    return 'Guten Tag';
  }
}
