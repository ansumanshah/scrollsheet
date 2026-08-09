import { Sheet } from "scrollsheet";

import { ReplyIcon, StarIcon, TrendingUpIcon } from "./icons";

interface CommentPhotoData {
  file: string;
  /** Screen-reader description of the photo itself. */
  alt: string;
  /** Visible caption line. */
  label: string;
  sub: string;
}

interface Comment {
  name: string;
  time: string;
  text: string;
  likes: number;
  photo?: CommentPhotoData;
  /** One level deep, so a reply never renders a reply of its own. */
  replies?: Comment[];
}

const COMMENTS: Comment[] = [
  {
    name: "Rosa Alves",
    time: "2m",
    text: "This trail is gorgeous, adding it to my list for next weekend.",
    likes: 14,
    replies: [
      {
        name: "Theo Marsh",
        time: "1m",
        text: "Same here, trying to beat the weekend crowds to the overlook.",
        likes: 3,
      },
    ],
  },
  {
    name: "Nadia Cole",
    time: "11m",
    text: "Caught this right at the top, worth every step of the last mile.",
    likes: 22,
    photo: {
      file: "shot-02",
      alt: "Snow-covered mountain ridge along a trekking route",
      label: "Ridge line, day two",
      sub: "Khumjung, Nepal",
    },
  },
  {
    name: "Kofi Mensah",
    time: "14m",
    text: "Is the trailhead parking lot usually full by mid morning?",
    likes: 2,
  },
  {
    name: "Jia Chen",
    time: "19m",
    text: "That ridge line view at the top is unreal in person.",
    likes: 9,
  },
  {
    name: "Sam Whitfield",
    time: "23m",
    text: "Did you need poles for the last mile or was it manageable without?",
    likes: 1,
  },
  {
    name: "Priya Nair",
    time: "31m",
    text: "Saving this for our anniversary trip, it looks perfect.",
    likes: 11,
  },
  {
    name: "Marco Rossi",
    time: "38m",
    text: "The light in the third shot is doing a lot of work, well earned.",
    likes: 6,
  },
  {
    name: "Hana Suzuki",
    time: "44m",
    text: "How long did the full loop take you, roughly?",
    likes: 0,
  },
  {
    name: "Omar Farouk",
    time: "52m",
    text: "We tried this last month and got turned back by the weather, jealous of the clear skies.",
    likes: 8,
  },
  {
    name: "Lena Bauer",
    time: "1h",
    text: "Adding a proper pack list now, this convinced me.",
    likes: 4,
  },
  {
    name: "Viktor Sokolov",
    time: "1h",
    text: "Underrated trail, glad it's finally getting some attention.",
    likes: 17,
  },
  {
    name: "Uma Iyer",
    time: "1h",
    text: "Any wildlife sightings? Curious if it's worth bringing the long lens.",
    likes: 3,
  },
  {
    name: "Ben Ortiz",
    time: "2h",
    text: "That switchback section looks brutal but so worth it.",
    likes: 5,
  },
  {
    name: "Grace Kim",
    time: "2h",
    text: "Bookmarking for a fall trip when the colors turn.",
    likes: 7,
  },
  {
    name: "Chidi Okafor",
    time: "2h",
    text: "This is exactly the kind of route I've been looking for, thank you.",
    likes: 12,
  },
  {
    name: "Fatima Haddad",
    time: "3h",
    text: "Did the creek crossing near the halfway point still have water?",
    likes: 1,
  },
  {
    name: "Ivo Novak",
    time: "3h",
    text: "The elevation gain graph you posted was really helpful for planning.",
    likes: 9,
  },
  {
    name: "Wren Delacroix",
    time: "3h",
    text: "Six out of five stars for that summit shot alone.",
    likes: 26,
  },
  {
    name: "Yara Haddad",
    time: "4h",
    text: "How early did you start to catch that light?",
    likes: 2,
  },
  {
    name: "Zane Ahmadi",
    time: "4h",
    text: "Doing this with the kids next month, appreciate the trail notes.",
    likes: 6,
  },
  {
    name: "Dana Lindqvist",
    time: "5h",
    text: "The switch to gravel near the ridge caught me off guard last time, good to see it flagged.",
    likes: 4,
  },
  {
    name: "Emre Kaya",
    time: "6h",
    text: "This might be my new favorite loop in the area.",
    likes: 13,
  },
  {
    name: "Tara Singh",
    time: "7h",
    text: "Perfect timing, was just looking for a route for Saturday.",
    likes: 3,
  },
  {
    name: "Quinn Walsh",
    time: "8h",
    text: "The last stretch before the overlook is no joke, worth the burn though.",
    likes: 10,
  },
  {
    name: "Asha Rao",
    time: "9h",
    text: "Love seeing this trail get some love, it deserves it.",
    likes: 15,
  },
  {
    name: "Rosa Alves",
    time: "11h",
    text: "Following up, we did the loop yesterday and it was even better in person.",
    likes: 19,
  },
  {
    name: "Kofi Mensah",
    time: "13h",
    text: "Parking filled up by 8am for us, worth arriving early.",
    likes: 5,
  },
  {
    name: "Nadia Cole",
    time: "1d",
    text: "Printed your notes and brought them along, made the whole day easier.",
    likes: 8,
  },
  {
    name: "Theo Marsh",
    time: "1d",
    text: "Already planning the return trip for next season.",
    likes: 4,
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("");
}

function CommentActions({ comment }: { comment: Comment }) {
  return (
    <div className="ex-comment-actions">
      <button type="button" className="ex-comment-action" aria-label={`Like, ${comment.likes}`}>
        <StarIcon aria-hidden="true" />
        <span>{comment.likes}</span>
      </button>
      <button type="button" className="ex-comment-action">
        <ReplyIcon aria-hidden="true" />
        <span>Reply</span>
      </button>
    </div>
  );
}

/** Thumb-size photo attachment: same AVIF+WebP pair the lightbox grid uses. */
function CommentPhoto({ file, alt, label, sub }: CommentPhotoData) {
  return (
    <figure className="ex-comment-photo">
      <picture>
        <source srcSet={`/img/${file}-thumb.avif`} type="image/avif" />
        <img src={`/img/${file}-thumb.webp`} alt={alt} width={420} height={280} loading="lazy" />
      </picture>
      <figcaption>
        <span className="ex-row-title">{label}</span>
        <span className="ex-row-sub">{sub}</span>
      </figcaption>
    </figure>
  );
}

function CommentRow({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) {
  return (
    <div className={isReply ? "ex-comment ex-comment-reply" : "ex-comment"}>
      <span className="ex-avatar ex-comment-avatar">{initials(comment.name)}</span>
      <div className="ex-comment-body">
        <div>
          <span className="ex-comment-name">{comment.name}</span>
          <span className="ex-comment-meta">{comment.time}</span>
        </div>
        <div className="ex-comment-text">{comment.text}</div>
        {comment.photo ? <CommentPhoto {...comment.photo} /> : null}
        <CommentActions comment={comment} />
        {comment.replies?.map((reply, i) => (
          <CommentRow comment={reply} isReply key={`${reply.name}-${reply.time}-${i}`} />
        ))}
      </div>
    </div>
  );
}

const TOTAL_COUNT = COMMENTS.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0);

/**
 * scrollbar="overlay" (Root) drives the panel's own auto-hiding thumb once
 * content is taller than the panel, at 'full' here. The panel's internal
 * scroll and the sheet's own reveal scroll are two separate things, and this
 * is the recipe for the former.
 */
export default function CommentsExample() {
  return (
    <Sheet.Root detents={["full"]} scrollbar="overlay" themeColorDimming>
      <Sheet.Trigger className="ex-trigger">View comments</Sheet.Trigger>
      <Sheet.Content className="ex-panel" aria-label="Comments">
        <Sheet.Handle />
        <div className="ex-panel-body">
          <div className="ex-comment-toolbar">
            <Sheet.Title>{TOTAL_COUNT} comments</Sheet.Title>
            <button type="button" className="ex-comment-sort">
              <TrendingUpIcon aria-hidden="true" />
              Top
            </button>
          </div>
          <div className="ex-comment-list">
            {COMMENTS.map((comment, i) => (
              <CommentRow comment={comment} key={`${comment.name}-${comment.time}-${i}`} />
            ))}
          </div>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
