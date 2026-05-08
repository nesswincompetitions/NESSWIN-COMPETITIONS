/**
 * Utility to export an array of objects to a CSV file.
 * 
 * @param {Array} data - Array of objects to export
 * @param {Array} headers - Array of { label, key } objects for CSV headers
 * @param {string} filename - Name of the file to be downloaded
 */
export const exportToCSV = (data, headers, filename = 'export.csv') => {
  if (!data || !data.length) return;

  // Create CSV rows
  const csvRows = [];

  // Add header row
  csvRows.push(headers.map(h => `"${h.label}"`).join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = header.key.split('.').reduce((obj, key) => (obj && obj[key] !== undefined) ? obj[key] : '', row);
      const escaped = ('' + value).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  // Create Blob and download
  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
