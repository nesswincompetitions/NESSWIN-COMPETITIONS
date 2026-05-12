/**
 * Formats a raw status string (e.g., 'ready_for_draw') into a human-readable format.
 * Replaces underscores with spaces and capitalizes each word.
 */
export const formatStatus = (status) => {
  if (!status) return '';
  
  // Handle specific known statuses if needed
  if (status === 'ready_for_draw') return 'Ready for Draw';
  
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};
