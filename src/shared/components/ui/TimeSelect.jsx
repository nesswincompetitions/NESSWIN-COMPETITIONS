import React, { useState, useRef, useEffect } from 'react';
import { Clock, ChevronDown } from 'lucide-react';

const TimeSelect = ({ value, onChange, label, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Parse current value or default to 12:00
  const [currentHour, currentMin] = value ? value.split(':') : ['12', '00'];

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTimeChange = (h, m) => {
    const newTime = `${h}:${m}`;
    onChange({ target: { name: 'drawEndTime', value: newTime } });
  };

  // Auto-scroll logic for columns
  useEffect(() => {
    if (isOpen) {
      const hEl = document.getElementById(`h-${currentHour}`);
      const mEl = document.getElementById(`m-${currentMin}`);
      if (hEl) hEl.scrollIntoView({ block: 'center', behavior: 'instant' });
      if (mEl) mEl.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }, [isOpen, currentHour, currentMin]);

  return (
    <div className={`space-y-2 ${className}`} ref={dropdownRef}>
      {label && <label className="text-sm font-medium text-gray-300">{label}</label>}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`
            w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 
            text-sm text-left flex items-center justify-between transition-all
            hover:bg-white/[0.07] hover:border-white/20
            ${isOpen ? 'border-primary/50 ring-2 ring-primary/20' : 'focus:outline-none focus:border-primary/50'}
            ${!value ? 'text-gray-500' : 'text-white'}
          `}
        >
          <div className="flex items-center gap-2">
            <Clock className={`w-4 h-4 ${isOpen ? 'text-primary' : 'text-gray-500'}`} />
            <span className="font-medium tracking-wider">{value || 'Select Time'}</span>
          </div>
          <ChevronDown 
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`} 
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-48 mt-2 bg-[#121212] border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex h-64">
              {/* Hours Column */}
              <div className="flex-1 overflow-y-auto scrollbar-thin border-r border-white/5 py-1">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 text-center py-2 sticky top-0 bg-[#121212] z-10 font-bold">Hours</div>
                {hours.map((h) => (
                  <button
                    key={h}
                    id={`h-${h}`}
                    type="button"
                    onClick={() => handleTimeChange(h, currentMin)}
                    className={`
                      w-full py-2 text-sm transition-colors
                      ${currentHour === h 
                        ? 'bg-primary text-black font-bold' 
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'}
                    `}
                  >
                    {h}
                  </button>
                ))}
              </div>

              {/* Minutes Column */}
              <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 text-center py-2 sticky top-0 bg-[#121212] z-10 font-bold">Mins</div>
                {minutes.map((m) => (
                  <button
                    key={m}
                    id={`m-${m}`}
                    type="button"
                    onClick={() => handleTimeChange(currentHour, m)}
                    className={`
                      w-full py-2 text-sm transition-colors
                      ${currentMin === m 
                        ? 'bg-primary text-black font-bold' 
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'}
                    `}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Footer */}
            <div className="p-2 border-t border-white/10 bg-white/5">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full py-1.5 bg-primary text-black text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
              >
                Set Time
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeSelect;
