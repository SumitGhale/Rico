import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import type { EventItem } from '@howljs/calendar-kit';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MonthlyCalendarViewProps {
  events: EventItem[];
  onDayPress?: (dateString: string) => void;
}

interface DayEvent {
  id: string | number;
  title: string;
  color: string;
  startTime: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract YYYY-MM-DD from a dateTime string */
function toDateKey(dateTime: string): string {
  return dateTime.slice(0, 10);
}

/** Extract HH:MM from a dateTime string */
function toTimeString(dateTime: string): string {
  const d = new Date(dateTime);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MonthlyCalendarView({ events, onDayPress }: MonthlyCalendarViewProps) {
  const [selectedDate, setSelectedDate] = React.useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  // Build markedDates object for the Calendar component
  const { markedDates, eventsByDate } = useMemo(() => {
    const byDate: Record<string, DayEvent[]> = {};

    for (const evt of events) {
      const dt = evt.start?.dateTime;
      if (!dt) continue;
      const key = toDateKey(dt);
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push({
        id: evt.id ?? '',
        title: evt.title ?? 'Untitled',
        color: (evt.color as string) ?? '#3b82f6',
        startTime: toTimeString(dt),
      });
    }

    const marks: Record<string, any> = {};

    // Mark all event dates with dots
    for (const dateKey of Object.keys(byDate)) {
      const uniqueColors = [...new Set(byDate[dateKey].map((e) => e.color))];
      marks[dateKey] = {
        marked: true,
        dots: uniqueColors.slice(0, 3).map((c) => ({ key: c, color: c })),
      };
    }

    // Highlight selected date
    if (selectedDate) {
      marks[selectedDate] = {
        ...(marks[selectedDate] ?? {}),
        selected: true,
        selectedColor: '#3b82f6',
      };
    }

    return { markedDates: marks, eventsByDate: byDate };
  }, [events, selectedDate]);

  const handleDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
    onDayPress?.(day.dateString);
  };

  const selectedEvents = eventsByDate[selectedDate] ?? [];

  return (
    <View className="flex-1 bg-white">
      {/* Month Calendar Grid */}
      <Calendar
        current={selectedDate}
        onDayPress={handleDayPress}
        markedDates={markedDates}
        markingType="multi-dot"
        theme={{
          backgroundColor: '#ffffff',
          calendarBackground: '#ffffff',
          textSectionTitleColor: '#6b7280',
          selectedDayBackgroundColor: '#3b82f6',
          selectedDayTextColor: '#ffffff',
          todayTextColor: '#3b82f6',
          dayTextColor: '#1f2937',
          textDisabledColor: '#d1d5db',
          arrowColor: '#3b82f6',
          monthTextColor: '#111827',
          textMonthFontWeight: '600',
          textMonthFontSize: 17,
          textDayFontSize: 15,
          textDayHeaderFontSize: 13,
        }}
      />

      {/* Divider */}
      <View className="h-px bg-gray-200" />

      {/* Events list for selected day */}
      <View className="flex-1">
        {/* Day header */}
        <View className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <Text className="text-sm font-semibold text-gray-700">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>

        <ScrollView className="flex-1 px-4 pt-2 pb-4">
          {selectedEvents.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-gray-400 text-sm">No events on this day</Text>
            </View>
          ) : (
            selectedEvents
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((evt) => (
                <View
                  key={String(evt.id)}
                  className="flex-row items-center mb-2 rounded-xl px-3 py-3 bg-gray-50"
                >
                  {/* Color dot */}
                  <View
                    className="w-2.5 h-2.5 rounded-full mr-3"
                    style={{ backgroundColor: evt.color }}
                  />
                  {/* Event info */}
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
                      {evt.title}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-0.5">{evt.startTime}</Text>
                  </View>
                </View>
              ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}
