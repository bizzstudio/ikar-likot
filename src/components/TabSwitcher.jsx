// src/components/TabSwitcher.jsx
import React, { useEffect } from 'react';

const TabSwitcher = ({ tabs = [{ id: '', label: '' }], activeTabId, setActiveTabId, disabled }) => {
    // אם אין activeTabId מוגדר, נבחר את הכרטיסייה האחרונה כברירת מחדל
    const effectiveActiveTabId = activeTabId || (tabs.length > 0 ? tabs[tabs.length - 1].id : '');
    const activeTabIndex = tabs.findIndex((tab) => tab.id === effectiveActiveTabId);
    const indicatorWidth = 100 / tabs.length;

    // אם אין activeTabId מוגדר, נגדיר את הכרטיסייה האחרונה כברירת מחדל
    useEffect(() => {
        if (!activeTabId && tabs.length > 0 && setActiveTabId) {
            setActiveTabId(tabs[tabs.length - 1].id);
        }
    }, [activeTabId, tabs, setActiveTabId]);

    return (
        <div className={`w-full max-w-[1300px] mx-auto ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
            <div className="relative flex items-start justify-around p-0.5 bg-gray-200 dark:bg-gray-700 dark:text-white rounded-[7px]">
                {/* אינדיקטור */}
                <div
                    className="absolute top-[1px] bg-mainColor rounded-[5px] transition-all duration-300 ease-out shadow-md"
                    style={{
                        height: 'calc(100% - 2px)',
                        border: '0.5px solid rgba(0, 0, 0, 0.04)',
                        insetInlineStart: `${activeTabIndex * indicatorWidth}%`,
                        width: `${indicatorWidth}%`,
                    }}
                ></div>

                {/* כפתורי הכרטיסיות */}
                {tabs.map((tab, index) => (
                    <button
                        type='button'
                        key={tab.id}
                        className={`relative flex items-center justify-center w-full h-[22px] text-xs ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} transition-all duration-300 ${effectiveActiveTabId === tab.id
                            ? 'opacity-100 text-white font-bold'
                            : 'opacity-60'
                            }`}
                        onClick={() => {
                            setActiveTabId(tab.id);
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* תוכן הכרטיסיות */}
            {/* <div className="mt-4">
                {tabs.map(
                    (tab) => activeTabId === tab.id && <div key={tab.id}>{tab.content}</div>
                )}
            </div> */}
        </div>
    );
};

export default TabSwitcher;