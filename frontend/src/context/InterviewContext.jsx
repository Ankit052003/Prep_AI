import React, { createContext, useMemo, useState } from "react";

export const InterviewContext = createContext(null);

export function InterviewProvider({ children }) {
  const [interviewState, setInterviewState] = useState({});

  const value = useMemo(
    () => ({ interviewState, setInterviewState }),
    [interviewState]
  );

  return (
    <InterviewContext.Provider value={value}>
      {children}
    </InterviewContext.Provider>
  );
}
