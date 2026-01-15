import { PackingListItem, DataFilters } from '../types';

export const parseCSV = (csvText: string): PackingListItem[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data: PackingListItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i];
    if (!currentLine.trim()) continue;

    const values: string[] = [];
    let currentVal = '';
    let inQuote = false;
    
    for (let char of currentLine) {
      if (char === '"' || char === '“' || char === '”') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        values.push(currentVal.trim());
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    values.push(currentVal.trim());

    const item: any = {};
    headers.forEach((header, index) => {
      item[header] = values[index] || '';
    });

    const serial = parseInt(item.deliverdate);
    let dt: Date | null = null;
    if (!isNaN(serial)) {
        dt = new Date(Math.round((serial - 25569) * 86400 * 1000));
    }

    const nums = parseInt(item.Numbers);
    
    const enrichedItem: PackingListItem = {
        ...item,
        deliverdate_dt: dt,
        Numbers: isNaN(nums) ? 0 : nums,
        ModelNum: item.ModelNum || 'Unknown',
        DeviceName: item.DeviceName?.replace(/[“”"]/g, '') || 'Unknown Device'
    };
    
    data.push(enrichedItem);
  }
  return data;
};

export const filterData = (data: PackingListItem[], filters: DataFilters): PackingListItem[] => {
  return data.filter(item => {
    // Supplier Filter
    if (filters.supplier && item.Suppliername !== filters.supplier) {
      return false;
    }
    
    // Device Filter
    if (filters.device && item.DeviceName !== filters.device) {
      return false;
    }

    // Date Filter
    if (item.deliverdate_dt) {
      const itemDate = item.deliverdate_dt.getTime();
      if (filters.startDate && itemDate < new Date(filters.startDate).getTime()) {
        return false;
      }
      if (filters.endDate && itemDate > new Date(filters.endDate).getTime()) {
        return false;
      }
    }

    return true;
  });
};

export const aggregateData = (data: PackingListItem[]) => {
    const totalLines = data.length;
    const totalUnits = data.reduce((acc, curr) => acc + curr.Numbers, 0);
    const uniqueSuppliers = new Set(data.map(d => d.Suppliername)).size;
    const uniqueCustomers = new Set(data.map(d => d.customer)).size;

    // Time series
    const timeSeriesMap = new Map<string, number>();
    data.forEach(d => {
        if(d.deliverdate_dt) {
            const key = d.deliverdate_dt.toISOString().split('T')[0];
            timeSeriesMap.set(key, (timeSeriesMap.get(key) || 0) + d.Numbers);
        }
    });
    const timeSeries = Array.from(timeSeriesMap.entries())
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Top Devices
    const deviceMap = new Map<string, number>();
    data.forEach(d => {
        deviceMap.set(d.DeviceName, (deviceMap.get(d.DeviceName) || 0) + d.Numbers);
    });
    const topDevices = Array.from(deviceMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    // Customer Volume
    const customerMap = new Map<string, number>();
    data.forEach(d => {
        customerMap.set(d.customer, (customerMap.get(d.customer) || 0) + d.Numbers);
    });
    const customerVolume = Array.from(customerMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10); // Top 10

    return {
        totalLines,
        totalUnits,
        uniqueSuppliers,
        uniqueCustomers,
        timeSeries,
        topDevices,
        customerVolume
    };
};