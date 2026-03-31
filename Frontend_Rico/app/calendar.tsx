import { CalendarBody, CalendarContainer, CalendarHeader } from '@howljs/calendar-kit';
import type { OnEventResponse, OnCreateEventResponse } from '@howljs/calendar-kit';
import React from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';

const Calendar = () => {
    const { events, addDragEvent, updateEvent } = useCalendarEvents();

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
        <CalendarContainer
          numberOfDays={3}
            allowDragToCreate={true}
            onDragCreateEventStart={handleDragCreateStart}
            onDragCreateEventEnd={handleDragCreateEnd}
            dragStep={15}
            allowDragToEdit={true}
            onDragEventEnd={handleDragEnd}
            events={events}>
            <CalendarHeader />
            <CalendarBody />
        </CalendarContainer>
    );
};

export default Calendar;    