import { apiClient } from "@/lib/api-client";

export type LibraryBookListItem = {
  id: string;
  title: string;
  publisher: string;
  classLabel: string;
  subjectLabel: string;
  editionYear: string | null;
  chapterCount: number;
  schoolCount: number;
  createdBy: { id: string; firstName: string; lastName: string };
  originSchool: { id: string; name: string } | null;
  createdAt: string;
};

export type LibraryBookDetail = LibraryBookListItem & {
  chapters: Array<{
    id: string;
    chapterNumber: number | null;
    title: string;
    textLength: number;
    addedBySchoolId: string | null;
    createdAt: string;
  }>;
  grants: Array<{ id: string; schoolId: string; school: { id: string; name: string } }>;
};

export const libraryBooksService = {
  list() {
    return apiClient<LibraryBookListItem[]>("/library-books");
  },
  get(id: string) {
    return apiClient<LibraryBookDetail>(`/library-books/${id}`);
  },
  update(
    id: string,
    body: Partial<Pick<LibraryBookListItem, "title" | "publisher" | "classLabel" | "subjectLabel" | "editionYear">>,
  ) {
    return apiClient<LibraryBookListItem>(`/library-books/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
};
