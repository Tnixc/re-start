// Project/List matcher for task input
// Returns matched span + project info for highlighting and assignment.

/**
 * Parse project match from input text
 * Supports #project and #"project name" syntax
 *
 * @param {string} input - The task input text
 * @param {Array<{id: string, name: string}>} projects - Available projects/lists
 * @returns {Object|null} Match info with {match: {start, end}, projectId, projectName}
 */
export function parseProjectMatch(input, projects) {
    if (!input || !projects || projects.length === 0) return null

    const text = input
    const lower = input.toLowerCase()

    // Find all # symbols
    let index = 0
    while (index < text.length) {
        index = text.indexOf('#', index)
        if (index === -1) break

        // Check if this is the start of a project reference
        // Must be at start or preceded by whitespace
        if (index > 0 && !/\s/.test(text[index - 1])) {
            index++
            continue
        }

        let matchEnd = -1
        let matchText = ''

        // Check for quoted syntax: #"project name"
        if (text[index + 1] === '"') {
            const quoteStart = index + 2
            const quoteEnd = text.indexOf('"', quoteStart)
            if (quoteEnd !== -1) {
                matchText = text.slice(quoteStart, quoteEnd)
                matchEnd = quoteEnd + 1
            }
        } else {
            // Unquoted syntax with greedy matching: #project or #project name
            // Try progressively longer strings and use the longest match
            let longestMatch = null
            let words = []
            let pos = index + 1

            // Extract words and try matching after each word
            while (pos < text.length && text[pos] !== '#') {
                // Skip whitespace
                while (pos < text.length && /\s/.test(text[pos])) {
                    pos++
                }

                if (pos >= text.length || text[pos] === '#') break

                // Get next word
                let wordEnd = pos
                while (wordEnd < text.length && !/[\s#]/.test(text[wordEnd])) {
                    wordEnd++
                }

                if (wordEnd > pos) {
                    words.push(text.slice(pos, wordEnd))

                    // Try matching accumulated words
                    const candidate = words.join(' ')
                    const candidateLower = candidate.toLowerCase()
                    const match = projects.find(
                        (p) => p.name.toLowerCase() === candidateLower
                    )

                    if (match) {
                        longestMatch = {
                            text: candidate,
                            end: wordEnd,
                            project: match,
                        }
                    }
                }

                pos = wordEnd
            }

            if (longestMatch) {
                // Found a match with greedy matching, return immediately
                const result = {
                    match: {
                        start: index,
                        end: longestMatch.end,
                    },
                    projectId: longestMatch.project.id,
                    projectName: longestMatch.project.name,
                }

                // Debug logging
                if (input.includes('#list 2 de')) {
                    console.log('Project matcher debug:', {
                        input,
                        matchedText: input.slice(index, longestMatch.end),
                        start: index,
                        end: longestMatch.end,
                        projectName: longestMatch.project.name,
                    })
                }

                return result
            }
        }

        // For quoted syntax, we still need to match against available projects
        if (matchText && matchEnd !== -1) {
            // Try to match against available projects (case-insensitive)
            const matchLower = matchText.toLowerCase()
            const project = projects.find(
                (p) => p.name.toLowerCase() === matchLower
            )

            if (project) {
                return {
                    match: {
                        start: index,
                        end: matchEnd,
                    },
                    projectId: project.id,
                    projectName: project.name,
                }
            }
        }

        index++
    }

    return null
}

/**
 * Strip project match from text
 * @param {string} text - The original text
 * @param {Object} match - Match object with {start, end}
 * @returns {string} Text with project match removed
 */
export function stripProjectMatch(text, match) {
    if (!match) return text.trim()
    const before = text.slice(0, match.start).trimEnd()
    const after = text.slice(match.end).trimStart()
    if (!before) return after
    if (!after) return before
    return `${before} ${after}`
}
