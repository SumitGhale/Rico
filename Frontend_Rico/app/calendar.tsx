import { CalendarBody, CalendarContainer, CalendarHeader } from '@howljs/calendar-kit';
import type { OnEventResponse, OnCreateEventResponse } from '@howljs/calendar-kit';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import {
  checkGoogleConnectionStatus,
  connectGoogleCalendar,
} from '@/services/googleAuthService';
import { MonthlyCalendarView } from '@/components/MonthlyCalendarView';

// ─── View Mode Types ──────────────────────────────────────────────────────────

type ViewMode = 'day' | '3day' | 'week' | 'month';

interface ViewOption {
  key: ViewMode;
  label: string;
  numberOfDays: number;
}

const VIEW_OPTIONS: ViewOption[] = [
  { key: 'day', label: 'Day', numberOfDays: 1 },
  { key: '3day', label: '3-Day', numberOfDays: 3 },
  { key: 'week', label: 'Week', numberOfDays: 7 },
  { key: 'month', label: 'Month', numberOfDays: 0 },
];

// ─── View Mode Selector ──────────────────────────────────────────────────────

function ViewModeSelector({
  current,
  onChange,
}: {
  current: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [buttonLayout, setButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const buttonRef = useRef<View>(null);

  const currentOption = VIEW_OPTIONS.find((o) => o.key === current)!;

  const handleSelect = (mode: ViewMode) => {
    onChange(mode);
    setIsOpen(false);
  };

  const handleOpen = () => {
    // Measure button position for dropdown placement
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      setButtonLayout({ x, y, width, height });
      setIsOpen(true);
    });
  };

  return (
    <>
      {/* Pill-shaped trigger button */}
      <View ref={buttonRef} collapsable={false}>
        <TouchableOpacity
          style={styles.selectorButton}
          onPress={handleOpen}
          activeOpacity={0.7}
        >
          <Text style={styles.selectorButtonText}>{currentOption.label}</Text>
          <Ionicons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="#374151"
          />
        </TouchableOpacity>
      </View>

      {/* Dropdown overlay */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.dropdownOverlay} onPress={() => setIsOpen(false)}>
          <View
            style={[
              styles.dropdownMenu,
              {
                top: buttonLayout.y + buttonLayout.height + 4,
                left: buttonLayout.x,
                minWidth: Math.max(buttonLayout.width, 120),
              },
            ]}
          >
            {VIEW_OPTIONS.map((option) => {
              const isActive = option.key === current;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
                  onPress={() => handleSelect(option.key)}
                  activeOpacity={0.6}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      isActive && styles.dropdownItemTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark" size={16} color="#3b82f6" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Google Connect Banner ────────────────────────────────────────────────────

function GoogleCalendarBanner() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null); // null = loading
  const [isConnecting, setIsConnecting] = useState(false);

  // Check connection status when the screen mounts
  useEffect(() => {
    checkGoogleConnectionStatus().then(setIsConnected);
  }, []);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const success = await connectGoogleCalendar();
      setIsConnected(success);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Still checking
  if (isConnected === null) {
    return (
      <View style={styles.banner}>
        <ActivityIndicator size="small" color="#6b7280" />
        <Text style={styles.bannerTextMuted}>Checking Google Calendar...</Text>
      </View>
    );
  }

  // Already connected
  if (isConnected) {
    return (
      <View style={[styles.banner, styles.bannerConnected]}>
        <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
        <Text style={styles.bannerTextConnected}>Google Calendar connected</Text>
      </View>
    );
  }

  // Not connected — show connect button
  return (
    <View style={[styles.banner, styles.bannerDisconnected]}>
      <Ionicons name="logo-google" size={16} color="#374151" />
      <Text style={styles.bannerTextMuted}>Google Calendar not connected</Text>
      <TouchableOpacity
        style={styles.connectButton}
        onPress={handleConnect}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.connectButtonText}>Connect</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Calendar Screen ─────────────────────────────────────────────────────

const Calendar = () => {
  const { events, addDragEvent, updateEvent } = useCalendarEvents();
  const [viewMode, setViewMode] = useState<ViewMode>('3day');

  const currentNumberOfDays = VIEW_OPTIONS.find((o) => o.key === viewMode)!.numberOfDays;

  const handleDragCreateStart = (event: OnCreateEventResponse) => {
    console.log("Started creating event at:", event);
  };

  const handleDragCreateEnd = (event: OnCreateEventResponse) => {
    console.log("New event:", event);
    addDragEvent({
      id: `drag-${Date.now()}`,
      title: "New Event",
      start: event.start,
      end: event.end,
      color: "#42d9f4ff",
    });
  };

  const handleDragEnd = (event: OnEventResponse) => {
    console.log(`Event ${event.id} moved to:`, event.start.dateTime, event.end.dateTime);
    updateEvent(event.id as string, event.start, event.end);
  };

  return (
    <View style={{ flex: 1 }}>
      <GoogleCalendarBanner />

      {/* ─── Toolbar with view mode selector ─── */}
      <View style={styles.toolbar}>
        <ViewModeSelector current={viewMode} onChange={setViewMode} />
      </View>

      {viewMode === 'month' ? (
        <MonthlyCalendarView events={events} />
      ) : (
        <CalendarContainer
          numberOfDays={currentNumberOfDays}
          allowDragToCreate={true}
          onDragCreateEventStart={handleDragCreateStart}
          onDragCreateEventEnd={handleDragCreateEnd}
          dragStep={15}
          allowDragToEdit={true}
          onDragEventEnd={handleDragEnd}
          events={events}
        >
          <CalendarHeader />
          <CalendarBody />
        </CalendarContainer>
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ─── Toolbar ───
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },

  // ─── Selector pill button ───
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  selectorButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },

  // ─── Dropdown overlay & menu ───
  dropdownOverlay: {
    flex: 1,
  },
  dropdownMenu: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemActive: {
    backgroundColor: '#eff6ff',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#374151',
  },
  dropdownItemTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },

  // ─── Google Banner ───
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  bannerConnected: {
    backgroundColor: '#f0fdf4',
    borderBottomColor: '#bbf7d0',
  },
  bannerDisconnected: {
    backgroundColor: '#fafafa',
  },
  bannerTextMuted: {
    flex: 1,
    fontSize: 13,
    color: '#6b7280',
  },
  bannerTextConnected: {
    flex: 1,
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '500',
  },
  connectButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default Calendar;