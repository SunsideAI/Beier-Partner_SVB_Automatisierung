import axios from 'axios';
import { config } from '../config';
import logger from '../utils/logger';

interface GeocodingResult {
  latitude: number;
  longitude: number;
  label: string;
}

/**
 * Geocodes an address using PositionStack API.
 * Returns null on failure (non-critical).
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  try {
    const res = await axios.get('http://api.positionstack.com/v1/forward', {
      params: {
        access_key: config.positionStack.key,
        query: address,
        limit: 1,
      },
      timeout: 10000,
    });

    const results = res.data?.data;
    if (!results || results.length === 0) {
      logger.warn({ address }, 'No geocoding results found');
      return null;
    }

    const { latitude, longitude, label } = results[0];
    logger.info({ address, latitude, longitude }, 'Geocoding successful');
    return { latitude, longitude, label };
  } catch (error) {
    logger.warn({ address, error }, 'Geocoding failed');
    return null;
  }
}
