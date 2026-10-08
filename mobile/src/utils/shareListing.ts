import { Share } from 'react-native';
import { buildListingShareUrl } from './shareLinks';

export const shareListing = async (id: string, name: string | undefined, type: string) => {
  if (!id) return;
  const shareUrl = buildListingShareUrl(id, type);
  try {
    await Share.share({
      message: `Check out ${name || 'this listing'} (${type}) on MusikaLokal!\n${shareUrl}`,
      url: shareUrl,
    });
  } catch {
    // User cancelled or sharing failed.
  }
};
