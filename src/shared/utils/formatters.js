/**
 * Formats a raw status string (e.g., 'ready_for_draw') into a human-readable format.
 * Replaces underscores with spaces and capitalizes each word.
 */
export const formatStatus = (status) => {
  if (!status) return '';
  
  // Handle specific known statuses if needed
  if (status === 'ready_to_draw') return 'Draw Soon';
  if (status === 'drawing') return 'Drawing';
  if (status === 'winner_announced') return 'Winner Announced';
  if (status === 'completed') return 'Completed';
  
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};
